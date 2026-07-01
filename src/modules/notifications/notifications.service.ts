import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  NotificationJobType,
  DEFAULT_JOB_OPTIONS,
  type PaymentReminderJob,
  type PaymentConfirmedJob,
  type OverdueAlertJob,
} from './queues/notification.queue.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PUSH) private readonly pushQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WHATSAPP) private readonly whatsappQueue: Queue,
  ) {}

  // ─── PAYMENT REMINDER ─────────────────────────────────────────────────────

  async sendPaymentReminder(params: {
    recordId: string;
    memberId: string;
    groupId: string;
    periodId: string;
    dueDate: string;
    amountDue: string;
    serviceName: string;
    memberName: string;
    memberEmail: string;
    memberPhone?: string;
    hostName: string;
    daysUntilDue: number;
    notificationPreference?: 'email' | 'push' | 'both' | 'none';
  }): Promise<void> {
    const { notificationPreference = 'email', memberPhone, ...jobData } = params;

    const job: PaymentReminderJob = {
      type: NotificationJobType.PAYMENT_REMINDER,
      ...jobData,
      memberPhone: memberPhone ?? '',
    };

    const wantsPush = notificationPreference === 'push' || notificationPreference === 'both';
    const wantsEmail = notificationPreference === 'email' || notificationPreference === 'both';

    if (wantsEmail) {
      await this.emailQueue.add(
        NotificationJobType.PAYMENT_REMINDER,
        job,
        DEFAULT_JOB_OPTIONS[NotificationJobType.PAYMENT_REMINDER],
      );
      this.logger.log(`Enqueued payment reminder email for record ${params.recordId}`);
    }

    if (wantsPush) {
      await this.pushQueue.add(
        NotificationJobType.PAYMENT_REMINDER,
        job,
        DEFAULT_JOB_OPTIONS[NotificationJobType.PAYMENT_REMINDER],
      );
      this.logger.log(`Enqueued payment reminder push for record ${params.recordId}`);
    }

    if (memberPhone) {
      await this.whatsappQueue.add(
        NotificationJobType.PAYMENT_REMINDER,
        job,
        DEFAULT_JOB_OPTIONS[NotificationJobType.PAYMENT_REMINDER],
      );
      this.logger.log(`Enqueued payment reminder WhatsApp for record ${params.recordId}`);
    }
  }

  // ─── PAYMENT CONFIRMED ────────────────────────────────────────────────────

  async sendPaymentConfirmed(params: {
    recordId: string;
    memberId: string;
    groupId: string;
    periodId: string;
    amountPaid: string;
    serviceName: string;
    memberName: string;
    hostEmail: string;
    hostPhone?: string;
    hostName: string;
    confirmedAt: string;
  }): Promise<void> {
    const { hostPhone, ...jobData } = params;

    const job: PaymentConfirmedJob = {
      type: NotificationJobType.PAYMENT_CONFIRMED,
      ...jobData,
      hostPhone: hostPhone ?? '',
    };

    await this.emailQueue.add(
      NotificationJobType.PAYMENT_CONFIRMED,
      job,
      DEFAULT_JOB_OPTIONS[NotificationJobType.PAYMENT_CONFIRMED],
    );
    this.logger.log(`Enqueued payment confirmed email for record ${params.recordId}`);

    await this.pushQueue.add(
      NotificationJobType.PAYMENT_CONFIRMED,
      job,
      DEFAULT_JOB_OPTIONS[NotificationJobType.PAYMENT_CONFIRMED],
    );
    this.logger.log(`Enqueued payment confirmed push for record ${params.recordId}`);

    if (hostPhone) {
      await this.whatsappQueue.add(
        NotificationJobType.PAYMENT_CONFIRMED,
        job,
        DEFAULT_JOB_OPTIONS[NotificationJobType.PAYMENT_CONFIRMED],
      );
      this.logger.log(`Enqueued payment confirmed WhatsApp for record ${params.recordId}`);
    }
  }

  // ─── OVERDUE ALERT ────────────────────────────────────────────────────────

  async sendOverdueAlert(params: {
    recordId: string;
    memberId: string;
    groupId: string;
    periodId: string;
    amountDue: string;
    serviceName: string;
    memberName: string;
    memberEmail: string;
    memberPhone?: string;
    hostName: string;
    dueDate: string;
    daysOverdue: number;
    notificationPreference?: 'email' | 'push' | 'both' | 'none';
  }): Promise<void> {
    const { notificationPreference = 'email', memberPhone, ...jobData } = params;

    const job: OverdueAlertJob = {
      type: NotificationJobType.OVERDUE_ALERT,
      ...jobData,
      memberPhone: memberPhone ?? '',
    };

    const wantsPush = notificationPreference === 'push' || notificationPreference === 'both';
    const wantsEmail = notificationPreference === 'email' || notificationPreference === 'both';

    if (wantsEmail) {
      await this.emailQueue.add(
        NotificationJobType.OVERDUE_ALERT,
        job,
        DEFAULT_JOB_OPTIONS[NotificationJobType.OVERDUE_ALERT],
      );
      this.logger.log(`Enqueued overdue alert email for record ${params.recordId}`);
    }

    if (wantsPush) {
      await this.pushQueue.add(
        NotificationJobType.OVERDUE_ALERT,
        job,
        DEFAULT_JOB_OPTIONS[NotificationJobType.OVERDUE_ALERT],
      );
      this.logger.log(`Enqueued overdue alert push for record ${params.recordId}`);
    }

    if (memberPhone) {
      await this.whatsappQueue.add(
        NotificationJobType.OVERDUE_ALERT,
        job,
        DEFAULT_JOB_OPTIONS[NotificationJobType.OVERDUE_ALERT],
      );
      this.logger.log(`Enqueued overdue alert WhatsApp for record ${params.recordId}`);
    }
  }

  // ─── BULK OPERATIONS ──────────────────────────────────────────────────────

  async bulkSendPaymentReminders(
    reminders: Parameters<typeof this.sendPaymentReminder>[0][],
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const reminder of reminders) {
      try {
        await this.sendPaymentReminder(reminder);
        success++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to enqueue reminder for record ${reminder.recordId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(`Bulk send reminders: ${success} success, ${failed} failed`);
    return { success, failed };
  }
}
