// src/modules/billing/billing-cycle.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  GroupEntity,
  PaymentPeriodEntity,
  GroupStatus,
  PeriodStatus,
  PaymentStatus,
  BillingFrequency,
} from '../../database/entities/index.js';
import { ErrorCode } from '../../common/constants/error-codes.js';
import { GroupRepository } from '../../database/repositories/index.js';
import { PaymentPeriodRepository } from '../../database/repositories/index.js';
import { PaymentRecordRepository } from '../../database/repositories/index.js';
import { GroupMemberRepository } from '../../database/repositories/index.js';
import { SplitCalculationService } from '../split/split-calculation.service.js';

@Injectable()
export class BillingCycleService {
  private readonly logger = new Logger(BillingCycleService.name);

  constructor(
    private readonly groupRepo: GroupRepository,
    private readonly periodRepo: PaymentPeriodRepository,
    private readonly recordRepo: PaymentRecordRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly splitService: SplitCalculationService,
  ) {}

  /**
   * Generate the next billing cycle for a group.
   * Idempotent: skips if an ACTIVE or UPCOMING cycle already exists.
   */
  async generateNextCycle(groupId: string): Promise<PaymentPeriodEntity> {
    const group = await this.groupRepo.findByIdOrFail(groupId);

    if (group.status === GroupStatus.PAUSED || group.status === GroupStatus.CANCELLED) {
      throw new BadRequestException({
        code: ErrorCode.PERIOD_NOT_FOUND,
        message:
          group.status === GroupStatus.PAUSED
            ? 'Grup sedang dijeda. Aktifkan kembali untuk membuat siklus baru.'
            : 'Grup sudah dibatalkan. Tidak dapat membuat siklus baru.',
      });
    }

    // Guard: no duplicate active cycle
    const existing = await this.periodRepo.findCurrentByGroup(groupId);
    if (existing) {
      throw new BadRequestException({
        code: ErrorCode.PERIOD_NOT_FOUND,
        message: 'Grup sudah memiliki siklus aktif',
      });
    }

    const upcoming = await this.periodRepo.findUpcomingByGroup(groupId);
    if (upcoming) return upcoming; // idempotent

    const { periodStart, periodEnd, dueDate } = this.computePeriodDates(group);

    const period = await this.periodRepo.createEntity({
      groupId,
      periodStart: formatDate(periodStart),
      periodEnd: formatDate(periodEnd),
      dueDate: formatDate(dueDate),
      status: PeriodStatus.UPCOMING,
      totalCollected: '0',
    });

    // Calculate shares and create payment records
    const shares = await this.splitService.calculateShares(groupId);

    for (const share of shares) {
      await this.recordRepo.createEntity({
        periodId: period.id,
        memberId: share.memberId,
        amountDue: String(share.shareAmount),
        amountPaid: null,
        status: PaymentStatus.PENDING,
        confirmedAt: null,
        confirmationTokenHash: null,
        tokenExpiresAt: null,
        tokenUsed: false,
        paymentMethod: null,
        paymentNote: null,
        confirmedBy: null,
      });
    }

    this.logger.log(`Generated billing cycle for group ${groupId}: ${period.id}`);
    return period;
  }

  /**
   * Recompute period status based on its payment records.
   * - All PAID → COMPLETED
   * - Due date passed + not all paid → OVERDUE
   * - Otherwise → ACTIVE
   */
  async updateCycleStatus(periodId: string): Promise<PaymentPeriodEntity> {
    const period = await this.periodRepo.findByIdOrFail(periodId);
    const records = await this.recordRepo.findByPeriodId(periodId);

    if (records.length === 0) return period;

    const allPaid = records.every((r) => r.status === PaymentStatus.PAID);
    const anyPaid = records.some((r) => r.status === PaymentStatus.PAID);
    const now = new Date();
    const due = new Date(period.dueDate);

    let newStatus: PeriodStatus;
    if (allPaid) {
      newStatus = PeriodStatus.COMPLETED;
    } else if (now > due && !allPaid) {
      newStatus = PeriodStatus.OVERDUE;
    } else if (anyPaid) {
      newStatus = PeriodStatus.ACTIVE;
    } else {
      newStatus = period.status; // no change
    }

    if (newStatus !== period.status) {
      return this.periodRepo.update(periodId, { status: newStatus });
    }
    return period;
  }

  /**
   * Activate an UPCOMING period (called by scheduler on due date)
   */
  async activatePeriod(periodId: string): Promise<PaymentPeriodEntity> {
    const period = await this.periodRepo.findByIdOrFail(periodId);
    if (period.status !== PeriodStatus.UPCOMING) return period;
    return this.periodRepo.update(periodId, { status: PeriodStatus.ACTIVE });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private computePeriodDates(group: GroupEntity): {
    periodStart: Date;
    periodEnd: Date;
    dueDate: Date;
  } {
    const now = new Date();
    const dueDay = group.dueDay;

    let periodStart: Date;
    let periodEnd: Date;
    let dueDate: Date;

    if (group.frequency === BillingFrequency.MONTHLY) {
      // Period = current month, due on dueDay
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
      dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDay, periodEnd.getDate()));

      // If dueDate already passed, push to next month
      if (dueDate < now) {
        periodStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        dueDate = new Date(
          periodStart.getFullYear(),
          periodStart.getMonth(),
          Math.min(dueDay, periodEnd.getDate()),
        );
      }
    } else if (group.frequency === BillingFrequency.YEARLY) {
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = new Date(now.getFullYear(), 11, 31);
      dueDate = new Date(now.getFullYear(), 0, Math.min(dueDay, 28));
      if (dueDate < now) {
        periodStart = new Date(now.getFullYear() + 1, 0, 1);
        periodEnd = new Date(now.getFullYear() + 1, 11, 31);
        dueDate = new Date(now.getFullYear() + 1, 0, Math.min(dueDay, 28));
      }
    } else {
      // WEEKLY
      const dayOfWeek = now.getDay();
      const toMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() + toMonday);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 6);
      dueDate = new Date(periodStart);
      dueDate.setDate(periodStart.getDate() + Math.min(dueDay - 1, 6));
    }

    return { periodStart, periodEnd, dueDate };
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
