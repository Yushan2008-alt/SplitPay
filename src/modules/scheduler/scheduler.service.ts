import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentPeriodRepository } from '../../database/repositories/payment-period.repository.js';
import { PaymentRecordRepository } from '../../database/repositories/payment-record.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { GroupMemberEntity } from '../../database/entities/group-member.entity.js';
import { UserEntity } from '../../database/entities/user.entity.js';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly periodRepo: PaymentPeriodRepository,
    private readonly recordRepo: PaymentRecordRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── PAYMENT REMINDERS ────────────────────────────────────────────────────

  // Run daily at 08:00 — finds upcoming periods due within 3 days and sends reminders
  // ponytail: single O(n) pass per period; if group count grows past ~500, batch-load periods first
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleDailyPaymentReminders(): Promise<void> {
    this.logger.log('Starting daily payment reminder check...');

    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const start = fmt(today);
    const end = fmt(threeDaysFromNow);

    const periods = await this.periodRepo.findUpcomingDueBetween(start, end);

    if (periods.length === 0) {
      this.logger.log('No upcoming periods due within 3 days — skipping');
      return;
    }

    this.logger.log(`Found ${periods.length} upcoming periods due between ${start} and ${end}`);

    const reminders: Parameters<typeof this.notificationsService.sendPaymentReminder>[0][] = [];

    for (const period of periods) {
      const records = await this.recordRepo.findPendingByPeriodId(period.id);

      for (const record of records) {
        const member = record.member as GroupMemberEntity | undefined;
        const memberUser = member?.user as UserEntity | undefined;
        const host = period.group?.host as UserEntity | undefined;

        if (!member || !host) continue;

        // ponytail: simple days-until-due calculation; assumes dueDate is valid ISO
        const dueDate = new Date(period.dueDate);
        const diffTime = dueDate.getTime() - today.getTime();
        const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        reminders.push({
          recordId: record.id,
          memberId: member.id,
          groupId: period.groupId,
          periodId: period.id,
          dueDate: period.dueDate,
          amountDue: record.amountDue,
          serviceName: period.group?.serviceName ?? '',
          memberName: member.displayName,
          memberEmail: member.email,
          memberPhone: memberUser?.phone ?? undefined,
          hostName: host.name,
          daysUntilDue: Math.max(0, daysUntilDue),
          notificationPreference: member.notificationPreference,
        });
      }
    }

    if (reminders.length === 0) {
      this.logger.log('No pending records found for upcoming periods — skipping');
      return;
    }

    const { success, failed } = await this.notificationsService.bulkSendPaymentReminders(reminders);
    this.logger.log(`Daily reminder done — ${success} enqueued, ${failed} failed`);
  }
}
