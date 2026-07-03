import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { PaymentRecordRepository } from '../../database/repositories/payment-record.repository.js';
import { PaymentPeriodRepository } from '../../database/repositories/payment-period.repository.js';
import { GroupRepository } from '../../database/repositories/group.repository.js';
import { GroupMemberRepository } from '../../database/repositories/group-member.repository.js';
import { BillingCycleService } from '../billing/billing-cycle.service.js';
import { QUEUE_NAMES, NotificationJobType } from '../notifications/queues/notification.queue.js';
import type {
  PaymentReminderJob,
  OverdueAlertJob,
} from '../notifications/queues/notification.queue.js';
import {
  PaymentStatus,
  PeriodStatus,
  NotificationPreference,
} from '../../database/entities/index.js';

@Injectable()
export class DailyCheckService {
  private readonly logger = new Logger(DailyCheckService.name);

  constructor(
    private readonly paymentRepo: PaymentRecordRepository,
    private readonly periodRepo: PaymentPeriodRepository,
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly billingService: BillingCycleService,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PUSH) private readonly pushQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WHATSAPP) private readonly whatsappQueue: Queue,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  /**
   * Daily cron job at 07:00 WIB (Asia/Jakarta, UTC+7)
   * Runs payment reminders, overdue detection, and cycle generation
   */
  @Cron('0 7 * * *', {
    name: 'daily-payment-check',
    timeZone: 'Asia/Jakarta',
  })
  async handleDailyCheck() {
    this.logger.log('Starting daily payment check at 07:00 WIB');

    try {
      await Promise.allSettled([
        this.checkPaymentReminders(),
        this.markOverdueAndAlert(),
        this.generateUpcomingCycles(),
      ]);

      this.logger.log('Daily payment check completed');
    } catch (error) {
      this.logger.error('Daily payment check failed', error);
    }
  }

  /**
   * Check for payment reminders (T-3, T-1, T-0 days before due date)
   * Uses Redis for deduplication with 25h TTL
   */
  async checkPaymentReminders(): Promise<void> {
    this.logger.log('Checking payment reminders...');

    // Query all PENDING payments with relations loaded
    const pendingPayments = await this.paymentRepo.findByStatusWithRelations(PaymentStatus.PENDING);
    const filtered = pendingPayments.filter(p => p.period?.status === PeriodStatus.ACTIVE);

    this.logger.log(`Found ${filtered.length} pending payments`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const payment of filtered) {
      const dueDate = new Date(payment.period.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Only send reminders at T-3, T-1, T-0
      if (![3, 1, 0].includes(daysUntilDue)) {
        continue;
      }

      const reminderType = `T-${daysUntilDue}`;
      const dedupKey = `notif:sent:${payment.id}:${reminderType}`;

      // Check deduplication
      const alreadySent = await this.redis.get(dedupKey);
      if (alreadySent) {
        this.logger.debug(
          `Skipping ${reminderType} reminder for payment ${payment.id} (already sent)`,
        );
        continue;
      }

      this.logger.log(
        `Sending ${reminderType} reminder for payment ${payment.id}`,
      );

      // Enqueue to appropriate notification channels
      await this.enqueueNotifications(payment, daysUntilDue);

      // Set dedup key with 25h TTL
      await this.redis.setex(dedupKey, 25 * 60 * 60, Date.now().toString());
    }
  }

  /**
   * Mark overdue payments and send alerts to members
   */
  async markOverdueAndAlert(): Promise<void> {
    this.logger.log('Checking for overdue payments...');

    // Find all PENDING payments with relations loaded
    const pendingPayments = await this.paymentRepo.findByStatusWithRelations(PaymentStatus.PENDING);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nowMs = Date.now();

    const overdueIds: string[] = [];

    for (const payment of pendingPayments) {
      if (!payment.period) continue;

      const dueDate = new Date(payment.period.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      const graceDays = payment.period.group?.gracePeriodDays ?? 3;
      const graceEndMs = dueDate.getTime() + graceDays * 24 * 60 * 60 * 1000;

      if (nowMs > graceEndMs) {
        await this.paymentRepo.update(payment.id, { status: PaymentStatus.EXPIRED });
        overdueIds.push(payment.id);
      }
    }

    this.logger.log(`Marked ${overdueIds.length} payments as overdue`);

    // Send OVERDUE_ALERT to members
    for (const id of overdueIds) {
      const fullPayment = await this.paymentRepo.findByIdWithRelations(id);
      if (!fullPayment || !fullPayment.member?.user) {
        this.logger.warn(
          `Cannot send overdue alert for payment ${id}: missing relations`,
        );
        continue;
      }

      this.logger.log(
        `Sending overdue alert for payment ${id} to member ${fullPayment.member.id}`,
      );

      const daysOverdue = Math.ceil(
        (nowMs - new Date(fullPayment.period.dueDate).getTime()) / (1000 * 60 * 60 * 24),
      );

      const alertJob: OverdueAlertJob = {
        type: NotificationJobType.OVERDUE_ALERT,
        recordId: fullPayment.id,
        memberId: fullPayment.member.id,
        groupId: fullPayment.period.groupId,
        periodId: fullPayment.period.id,
        amountDue: fullPayment.amountDue,
        serviceName: fullPayment.period.group.serviceName,
        hostName: fullPayment.period.group.host?.name || 'Host',
        memberName: fullPayment.member.user.name,
        memberEmail: fullPayment.member.user.email,
        dueDate: fullPayment.period.dueDate,
        daysOverdue,
      };

      await this.enqueueByPreference(fullPayment.member, alertJob);
    }
  }

  /**
   * Generate upcoming billing cycles for active groups
   * Only for groups with no pending/active cycles and dueDay within next 7 days
   */
  async generateUpcomingCycles(): Promise<void> {
    this.logger.log('Generating upcoming billing cycles...');

    // Query all active groups
    const activeGroups = await this.groupRepo.findActive();

    this.logger.log(`Found ${activeGroups.length} active groups`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const group of activeGroups) {
      // Check if group already has a current (ACTIVE or UPCOMING) period
      const currentPeriod = await this.periodRepo.findCurrentByGroup(group.id);

      if (currentPeriod) {
        continue;
      }

      // Check if dueDay is within next 7 days
      const dueDay = group.dueDay;
      const currentDay = today.getDate();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      // Calculate next due date
      let nextDueDate = new Date(currentYear, currentMonth, dueDay);
      nextDueDate.setHours(0, 0, 0, 0);

      // If due day already passed this month, use next month
      if (nextDueDate <= today) {
        nextDueDate = new Date(currentYear, currentMonth + 1, dueDay);
        nextDueDate.setHours(0, 0, 0, 0);
      }

      const daysUntilDue = Math.ceil(
        (nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Only generate if due date is within next 7 days
      if (daysUntilDue > 7 || daysUntilDue < 0) {
        continue;
      }

      this.logger.log(
        `Generating billing cycle for group ${group.id} (due in ${daysUntilDue} days)`,
      );

      try {
        await this.billingService.generateNextCycle(group.id);
      } catch (error) {
        this.logger.error(
          `Failed to generate billing cycle for group ${group.id}`,
          error,
        );
      }
    }
  }

  /**
   * Enqueue notifications based on member preferences
   * Handles PAYMENT_REMINDER jobs with fallback to email
   */
  private async enqueueNotifications(
    payment: any,
    daysUntilDue: number,
  ): Promise<void> {
    const member = payment.member;
    if (!member?.user) {
      this.logger.warn(
        `Cannot enqueue notification for payment ${payment.id}: missing member/user`,
      );
      return;
    }

    const reminderJob: PaymentReminderJob = {
      type: NotificationJobType.PAYMENT_REMINDER,
      recordId: payment.id,
      memberId: member.id,
      groupId: payment.period.groupId,
      periodId: payment.period.id,
      dueDate: payment.period.dueDate,
      amountDue: payment.amountDue,
      serviceName: payment.period.group.serviceName,
      memberName: member.user.name,
      memberEmail: member.user.email,
      hostName: payment.period.group.host?.name || 'Host',
      daysUntilDue,
    };

    await this.enqueueByPreference(member, reminderJob);
  }

  /**
   * Enqueue notification job to appropriate queues based on member preference
   * Uses Promise.allSettled for resilience (one channel failure doesn't block others)
   * Fallback: if NONE or no preference but has email → send email
   */
  private async enqueueByPreference(
    member: any,
    job: PaymentReminderJob | OverdueAlertJob,
  ): Promise<void> {
    const preference =
      member.notificationPreference || NotificationPreference.BOTH;
    const hasEmail = !!member.user?.email;

    const promises: Promise<any>[] = [];

    switch (preference) {
      case NotificationPreference.EMAIL:
        if (hasEmail) {
          promises.push(this.emailQueue.add(job.type, job));
        }
        break;

      case NotificationPreference.PUSH:
        promises.push(this.pushQueue.add(job.type, job));
        break;

      case NotificationPreference.BOTH:
        if (hasEmail) {
          promises.push(this.emailQueue.add(job.type, job));
        }
        promises.push(this.pushQueue.add(job.type, job));
        break;

      case NotificationPreference.NONE:
      default:
        // Fallback: if no preference but has email, send email anyway
        if (hasEmail) {
          this.logger.log(
            `Fallback: sending email to member ${member.id} (preference: ${preference})`,
          );
          promises.push(this.emailQueue.add(job.type, job));
        }
        break;
    }

    // Use Promise.allSettled to handle partial failures
    const results = await Promise.allSettled(promises);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      this.logger.error(
        `Failed to enqueue ${failed.length}/${results.length} notifications for member ${member.id}`,
      );
    } else {
      this.logger.debug(
        `Successfully enqueued ${results.length} notifications for member ${member.id}`,
      );
    }
  }
}
