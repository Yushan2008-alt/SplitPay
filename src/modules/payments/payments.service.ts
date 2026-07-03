import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/constants/error-codes.js';
import { validateSignedToken } from '../../common/utils/crypto.util.js';
import {
  GatewayProvider,
  GroupEntity,
  MemberRole,
  MemberStatus,
  PaymentConfirmationSource,
  PaymentStatus,
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
import { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory.js';
import type { ManualMarkPaidDto } from './dto/manual-mark-paid.dto.js';

type ReviewAction = 'approve' | 'reject';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly signedUrlSecret: string;

  // ponytail: centralized transition rules so every caller enforces the same state machine.
  private readonly transitionMap: Record<PaymentStatus, readonly PaymentStatus[]> = {
    [PaymentStatus.PENDING]: [
      PaymentStatus.AWAITING_GATEWAY,
      PaymentStatus.PENDING_HOST_REVIEW,
      PaymentStatus.PAID, // host manual fast-path
      PaymentStatus.FAILED, // host waive
    ],
    [PaymentStatus.AWAITING_GATEWAY]: [
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
      PaymentStatus.EXPIRED,
      PaymentStatus.AWAITING_GATEWAY,
    ],
    [PaymentStatus.PAID]: [PaymentStatus.REFUNDED, PaymentStatus.PAID],
    [PaymentStatus.FAILED]: [PaymentStatus.FAILED],
    [PaymentStatus.EXPIRED]: [PaymentStatus.EXPIRED],
    [PaymentStatus.PENDING_HOST_REVIEW]: [
      PaymentStatus.PAID,
      PaymentStatus.PENDING,
    ],
    [PaymentStatus.REFUNDED]: [PaymentStatus.REFUNDED],
  };

  constructor(
    private readonly recordRepo: PaymentRecordRepository,
    private readonly periodRepo: PaymentPeriodRepository,
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly userRepo: UserRepository,
    private readonly billingService: BillingCycleService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly config: ConfigService,
  ) {
    this.signedUrlSecret = this.config.getOrThrow<string>('SIGNED_URL_SECRET');
  }

  async createGatewayPaymentLink(
    paymentId: string,
    requesterId: string,
  ): Promise<{
    paymentId: string;
    provider: GatewayProvider;
    checkoutUrl: string | null;
    qrisString: string | null;
    expiresAt: string;
  }> {
    const record = await this.recordRepo.findById(paymentId);
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record tidak ditemukan',
      });
    }

    const member = await this.memberRepo.findById(record.memberId);
    if (!member) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Member tidak ditemukan',
      });
    }
    const group = await this.groupRepo.findById(member.groupId);
    if (!group) {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Grup tidak ditemukan',
      });
    }
    await this.assertCanAccess(group, member, requesterId);

    const gateway = this.gatewayFactory.getGateway(group);
    const result = await gateway.createPaymentLink({
      paymentId: record.id,
      amount: Math.round(Number(record.amountDue)),
      expiresInMinutes: 60,
      payerName: member.displayName,
      description: `Pembayaran ${group.serviceName}`,
    });

    this.ensureTransition(record.status, PaymentStatus.AWAITING_GATEWAY);
    await this.recordRepo.update(record.id, {
      status: PaymentStatus.AWAITING_GATEWAY,
      gatewayProvider: gateway.provider,
      gatewayReferenceId: result.gatewayReferenceId,
      paymentMethod: result.checkoutUrl ? 'gateway_link' : 'gateway_qris',
    });

    return {
      paymentId: record.id,
      provider: gateway.provider,
      checkoutUrl: result.checkoutUrl,
      qrisString: result.qrisString,
      expiresAt: result.expiresAt,
    };
  }

  // ─── CONFIRM PAYMENT (SIGNED URL) ────────────────────────────────────────
  async confirmPayment(token: string): Promise<PaymentRecordEntity> {
    const payload = validateSignedToken(token, this.signedUrlSecret);
    if (!payload || typeof payload.recordId !== 'string') {
      throw new BadRequestException({
        code: ErrorCode.INVALID_SIGNED_URL,
        message: 'Token tidak valid atau sudah kadaluarsa',
      });
    }

    const recordId = payload.recordId as string;
    const usedKey = `confirm:used:${recordId}`;
    const isUsed = await this.redisService.get(usedKey);
    if (isUsed) {
      const record = await this.recordRepo.findById(recordId);
      if (record) return record;
      throw new BadRequestException({
        code: ErrorCode.INVALID_SIGNED_URL,
        message: 'Token sudah digunakan',
      });
    }

    const record = await this.recordRepo.findById(recordId);
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record tidak ditemukan',
      });
    }

    if (record.status === PaymentStatus.PENDING_HOST_REVIEW) {
      await this.redisService.set(usedKey, 'true', 7 * 24 * 60 * 60);
      return record;
    }

    this.ensureTransition(record.status, PaymentStatus.PENDING_HOST_REVIEW);
    const updated = await this.recordRepo.update(record.id, {
      status: PaymentStatus.PENDING_HOST_REVIEW,
      confirmedBy: PaymentConfirmationSource.MEMBER_SELF_REPORT,
      paymentNote: 'Self-report via signed URL',
    });

    await this.redisService.set(usedKey, 'true', 7 * 24 * 60 * 60);
    return updated;
  }

  // ─── HOST MANUAL ACTIONS ──────────────────────────────────────────────────
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

    await this.assertHostOwnership(record.memberId, hostUserId);
    if (record.status === PaymentStatus.PAID) return record;

    this.ensureTransition(record.status, PaymentStatus.PAID);
    const paidAt = new Date();
    const updated = await this.recordRepo.update(record.id, {
      status: PaymentStatus.PAID,
      amountPaid: record.amountDue,
      paidAt,
      confirmedAt: paidAt,
      confirmedBy: PaymentConfirmationSource.HOST_MANUAL,
      paymentMethod: dto.paymentMethod ?? null,
      paymentNote: dto.paymentNote ?? null,
    });

    await this.billingService.updateCycleStatus(record.periodId);
    return updated;
  }

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
    await this.assertHostOwnership(record.memberId, hostUserId);

    const target =
      record.status === PaymentStatus.PAID
        ? PaymentStatus.REFUNDED
        : PaymentStatus.FAILED;
    this.ensureTransition(record.status, target);

    return this.recordRepo.update(record.id, {
      status: target,
      confirmedBy: PaymentConfirmationSource.HOST_MANUAL,
      paymentNote: 'Waived manually by host',
    });
  }

  async confirmManual(
    periodId: string,
    memberId: string,
    userId: string,
  ): Promise<PaymentRecordEntity> {
    const member = await this.memberRepo.findById(memberId);
    if (!member) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Member tidak ditemukan',
      });
    }
    if (member.userId !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Anda tidak dapat mengkonfirmasi member lain',
      });
    }

    const record = await this.recordRepo.findByPeriodAndMember(periodId, memberId);
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record tidak ditemukan',
      });
    }

    this.ensureTransition(record.status, PaymentStatus.PENDING_HOST_REVIEW);
    return this.recordRepo.update(record.id, {
      status: PaymentStatus.PENDING_HOST_REVIEW,
      confirmedBy: PaymentConfirmationSource.MEMBER_SELF_REPORT,
      paymentNote: 'Self-report manual confirmation',
    });
  }

  async reviewPayment(
    paymentId: string,
    hostUserId: string,
    action: ReviewAction,
  ): Promise<PaymentRecordEntity> {
    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Action harus approve atau reject',
      });
    }

    const record = await this.recordRepo.findById(paymentId);
    if (!record) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_RECORD_NOT_FOUND,
        message: 'Payment record tidak ditemukan',
      });
    }
    await this.assertHostOwnership(record.memberId, hostUserId);

    const target =
      action === 'approve' ? PaymentStatus.PAID : PaymentStatus.PENDING;
    this.ensureTransition(record.status, target);
    const paidAt = action === 'approve' ? new Date() : null;

    const updated = await this.recordRepo.update(record.id, {
      status: target,
      paidAt,
      confirmedAt: paidAt,
      amountPaid: action === 'approve' ? record.amountDue : record.amountPaid,
      confirmedBy:
        action === 'approve'
          ? PaymentConfirmationSource.HOST_MANUAL
          : record.confirmedBy,
    });

    if (action === 'approve') {
      await this.billingService.updateCycleStatus(record.periodId);
    }
    return updated;
  }

  async getPaymentHistory(
    userId: string,
    status?: PaymentStatus,
    groupId?: string,
  ): Promise<PaymentRecordEntity[]> {
    const memberships = await this.memberRepo.findByUserId(userId);
    const activeMemberships = memberships.filter(
      (member) => member.status === MemberStatus.ACTIVE,
    );
    const memberIds = activeMemberships.map((member) => member.id);
    const records = await Promise.all(
      memberIds.map((memberId) =>
        this.recordRepo.findHistoryByMemberAndFilters(memberId, status, groupId),
      ),
    );
    return records.flat();
  }

  // ─── PERIOD HISTORY ───────────────────────────────────────────────────────
  async getPeriods(
    groupId: string,
    userId: string,
  ): Promise<
    Array<{
      period: PaymentPeriodEntity;
      myRecord: PaymentRecordEntity | null;
    }>
  > {
    await this.assertGroupMembership(groupId, userId);
    const periods = await this.periodRepo.findByGroupId(groupId);

    const membership = await this.memberRepo.findByGroupAndUser(groupId, userId);
    if (!membership) return periods.map((p) => ({ period: p, myRecord: null }));

    const allRecords = await this.recordRepo.findByMemberId(membership.id);
    const recordMap = new Map(allRecords.map((r) => [r.periodId, r]));
    return periods.map((period) => ({
      period,
      myRecord: recordMap.get(period.id) ?? null,
    }));
  }

  async getPeriodDetail(
    groupId: string,
    periodId: string,
    userId: string,
  ): Promise<{
    period: PaymentPeriodEntity;
    records: PaymentRecordEntity[];
    myRole: MemberRole;
  }> {
    const myRole = await this.assertGroupMembership(groupId, userId);
    const period = await this.periodRepo.findById(periodId);
    if (!period || period.groupId !== groupId) {
      throw new NotFoundException({
        code: ErrorCode.PERIOD_NOT_FOUND,
        message: 'Periode tidak ditemukan',
      });
    }

    if (myRole === MemberRole.HOST) {
      const records = await this.recordRepo.findByPeriodId(periodId);
      return { period, records, myRole };
    }

    const membership = await this.memberRepo.findByGroupAndUser(groupId, userId);
    if (!membership) return { period, records: [], myRole };
    const myRecord = await this.recordRepo.findByPeriodAndMember(periodId, membership.id);
    return { period, records: myRecord ? [myRecord] : [], myRole };
  }

  // ─── GUARD HELPERS ────────────────────────────────────────────────────────
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
    if (group.hostId === userId) return MemberRole.HOST;

    const member = await this.memberRepo.findByGroupAndUser(groupId, userId);
    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Anda bukan anggota grup ini',
      });
    }
    return member.role;
  }

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

  private async assertCanAccess(
    group: GroupEntity,
    member: { userId: string | null },
    requesterId: string,
  ): Promise<void> {
    if (group.hostId === requesterId || member.userId === requesterId) return;
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Akses ditolak',
    });
  }

  private ensureTransition(from: PaymentStatus, to: PaymentStatus): void {
    if (this.transitionMap[from].includes(to)) return;
    throw new ConflictException({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Illegal state transition ${from} -> ${to}`,
    });
  }
}
