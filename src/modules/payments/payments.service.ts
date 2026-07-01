import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/constants/error-codes.js';
import { validateSignedToken } from '../../common/utils/crypto.util.js';
import {
  GroupEntity,
  MemberRole,
  MemberStatus,
  PaymentStatus,
  PeriodStatus,
} from '../../database/entities/index.js';
import type {
  PaymentPeriodEntity,
  PaymentRecordEntity,
} from '../../database/entities/index.js';
import {
  GroupMemberRepository,
  GroupRepository,
  PaymentPeriodRepository,
  PaymentRecordRepository,
  UserRepository,
} from '../../database/repositories/index.js';
import { BillingCycleService } from '../billing/billing-cycle.service.js';
import { RedisService } from '../auth/redis.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { ManualMarkPaidDto } from './dto/manual-mark-paid.dto.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly signedUrlSecret: string;

  constructor(
    private readonly recordRepo: PaymentRecordRepository,
    private readonly periodRepo: PaymentPeriodRepository,
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly userRepo: UserRepository,
    private readonly billingService: BillingCycleService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {
    this.signedUrlSecret = this.config.getOrThrow<string>('SIGNED_URL_SECRET');
  }

  // ─── CONFIRM PAYMENT (SIGNED URL) ────────────────────────────────────────

  /**
   * Confirm payment via signed URL token.
   * Idempotent: returns success if already paid.
   */
  async confirmPayment(token: string): Promise<PaymentRecordEntity> {
    // 1. Validate signed token
    const payload = validateSignedToken(token, this.signedUrlSecret);
    if (!payload || typeof payload.recordId !== 'string') {
      throw new BadRequestException({
        code: ErrorCode.INVALID_SIGNED_URL,
        message: 'Token tidak valid atau sudah kadaluarsa',
      });
    }

    const recordId = payload.recordId as string;

    // 2. Check idempotency in Redis (prevent replay attack)
    const usedKey = `confirm:used:${recordId}`;
    const isUsed = await this.redisService.get(usedKey);
    if (isUsed) {
      // Token already used, but check if record is PAID (idempotent success)
      const record = await this.recordRepo.findById(recordId);
      if (record?.status === PaymentStatus.PAID) {
        return record;
      }
      throw new BadRequestException({
        code: ErrorCode.INVALID_SIGNED_URL,
        message: 'Token sudah digunakan',
      });
    }

    // 3. Find payment record with relations
    const record = await this.recordRepo.findById(recordId);
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record tidak ditemukan',
      });
    }

    // 4. Idempotent: if already PAID, return success
    if (record.status === PaymentStatus.PAID) {
      await this.redisService.set(usedKey, 'true', 7 * 24 * 60 * 60); // 7 days
      return record;
    }

    // 5. Validate state transition: only PENDING or OVERDUE can become PAID
    if (
      record.status !== PaymentStatus.PENDING &&
      record.status !== PaymentStatus.OVERDUE
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Tidak dapat mengkonfirmasi pembayaran dengan status ${record.status}`,
      });
    }

    // 6. Update payment record to PAID
    const updated = await this.recordRepo.update(record.id, {
      status: PaymentStatus.PAID,
      amountPaid: record.amountDue,
      confirmedAt: new Date(),
      confirmedBy: 'self',
    });

    // 7. Mark token as used in Redis
    await this.redisService.set(usedKey, 'true', 7 * 24 * 60 * 60);

    // 8. Update billing cycle status
    await this.billingService.updateCycleStatus(record.periodId);

    // 9. Queue notification to host
    const member = await this.memberRepo.findById(record.memberId);
    if (member) {
      try {
        const group = await this.groupRepo.findById(member.groupId);
        const host = group ? await this.userRepo.findById(group.hostId) : null;
        if (group && host) {
          await this.notificationsService.sendPaymentConfirmed({
            recordId: record.id,
            memberId: member.id,
            groupId: member.groupId,
            periodId: record.periodId,
            amountPaid: record.amountPaid ?? record.amountDue,
            serviceName: group.name,
            memberName: member.displayName ?? member.email,
            hostEmail: host.email,
            hostPhone: host.phone ?? undefined,
            hostName: host.name,
            confirmedAt: (record.confirmedAt ?? new Date()).toISOString(),
          });
        }
      } catch (notifError) {
        /* ponytail: notification failure is non-fatal — payment is already
           confirmed, notification can be retried via queue. */
        this.logger.warn(
          `Failed to send payment_confirmed notification for record ${record.id}: ${(notifError as Error).message}`,
        );
      }
    }

    return updated;
  }

  // ─── HOST MANUAL ACTIONS ──────────────────────────────────────────────────

  /**
   * Host manually marks a member's payment as PAID.
   */
  async hostMarkPaid(
    recordId: string,
    hostUserId: string,
    dto: ManualMarkPaidDto,
  ): Promise<PaymentRecordEntity> {
    const record = await this.recordRepo.findById(recordId);
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record tidak ditemukan',
      });
    }

    // Assert host ownership via member → group → host
    await this.assertHostOwnership(record.memberId, hostUserId);

    // Idempotent: if already PAID, return as-is
    if (record.status === PaymentStatus.PAID) {
      return record;
    }

    // Validate state transition
    if (
      record.status !== PaymentStatus.PENDING &&
      record.status !== PaymentStatus.OVERDUE
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Tidak dapat mark paid untuk status ${record.status}`,
      });
    }

    // Update to PAID
    const updated = await this.recordRepo.update(record.id, {
      status: PaymentStatus.PAID,
      amountPaid: record.amountDue,
      confirmedAt: new Date(),
      confirmedBy: 'host',
      paymentMethod: dto.paymentMethod ?? null,
      paymentNote: dto.paymentNote ?? null,
    });

    // Update billing cycle status
    await this.billingService.updateCycleStatus(record.periodId);

    this.logger.log(`Host ${hostUserId} marked record ${recordId} as PAID`);
    return updated;
  }

  /**
   * Host waives a member's payment (e.g., member left, special case).
   */
  async waivePayment(
    recordId: string,
    hostUserId: string,
  ): Promise<PaymentRecordEntity> {
    const record = await this.recordRepo.findById(recordId);
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record tidak ditemukan',
      });
    }

    // Assert host ownership
    await this.assertHostOwnership(record.memberId, hostUserId);

    // Idempotent: if already WAIVED, return as-is
    if (record.status === PaymentStatus.WAIVED) {
      return record;
    }

    // No restriction: any status → WAIVED (host decision)
    const updated = await this.recordRepo.update(record.id, {
      status: PaymentStatus.WAIVED,
      confirmedAt: new Date(),
      confirmedBy: 'host',
    });

    // Update billing cycle status
    await this.billingService.updateCycleStatus(record.periodId);

    this.logger.log(`Host ${hostUserId} waived payment record ${recordId}`);
    return updated;
  }

  // ─── PERIOD HISTORY ───────────────────────────────────────────────────────

  /**
   * List all periods for a group (member access).
   * Returns periods with user's own payment record.
   */
  async getPeriods(
    groupId: string,
    userId: string,
  ): Promise<
    Array<{
      period: PaymentPeriodEntity;
      myRecord: PaymentRecordEntity | null;
    }>
  > {
    // Assert membership
    await this.assertGroupMembership(groupId, userId);

    const periods = await this.periodRepo.findByGroupId(groupId);

    // Find user's member record
    const membership = await this.memberRepo.findByGroupAndUser(
      groupId,
      userId,
    );
    if (!membership) {
      // User is host but not a member (edge case: host didn't add self as payer)
      return periods.map((p) => ({ period: p, myRecord: null }));
    }

    // Batch load user's payment records
    const allRecords = await this.recordRepo.findByMemberId(membership.id);
    const recordMap = new Map(allRecords.map((r) => [r.periodId, r]));

    return periods.map((period) => ({
      period,
      myRecord: recordMap.get(period.id) ?? null,
    }));
  }

  /**
   * Get period detail with payment records.
   * - Host: sees all records
   * - Payer: sees only own record
   */
  async getPeriodDetail(
    groupId: string,
    periodId: string,
    userId: string,
  ): Promise<{
    period: PaymentPeriodEntity;
    records: PaymentRecordEntity[];
    myRole: MemberRole;
  }> {
    // Assert membership
    const myRole = await this.assertGroupMembership(groupId, userId);

    const period = await this.periodRepo.findById(periodId);
    if (!period || period.groupId !== groupId) {
      throw new NotFoundException({
        code: ErrorCode.PERIOD_NOT_FOUND,
        message: 'Periode tidak ditemukan',
      });
    }

    let records: PaymentRecordEntity[];

    if (myRole === MemberRole.HOST) {
      // Host sees all records
      records = await this.recordRepo.findByPeriodId(periodId);
    } else {
      // Payer sees only own record
      const membership = await this.memberRepo.findByGroupAndUser(
        groupId,
        userId,
      );
      if (!membership) {
        records = [];
      } else {
        const myRecord = await this.recordRepo.findByPeriodAndMember(
          periodId,
          membership.id,
        );
        records = myRecord ? [myRecord] : [];
      }
    }

    return { period, records, myRole };
  }

  // ─── GUARD HELPERS ────────────────────────────────────────────────────────

  /**
   * Assert user is an active member or host of the group.
   * Returns user's role.
   */
  private async assertGroupMembership(
    groupId: string,
    userId: string,
  ): Promise<MemberRole> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Akses ditolak',
      });
    }

    // Host always has access
    if (group.hostId === userId) {
      return MemberRole.HOST;
    }

    // Check membership
    const member = await this.memberRepo.findByGroupAndUser(groupId, userId);
    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Anda bukan anggota grup ini',
      });
    }

    return member.role;
  }

  /**
   * Assert user is the host of the group that owns the member.
   */
  private async assertHostOwnership(
    memberId: string,
    userId: string,
  ): Promise<GroupEntity> {
    const member = await this.memberRepo.findById(memberId);
    if (!member) {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Member tidak ditemukan',
      });
    }

    const group = await this.groupRepo.findById(member.groupId);
    if (!group || group.hostId !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_HOST,
        message: 'Aksi ini hanya bisa dilakukan oleh host grup',
      });
    }

    return group;
  }
}
