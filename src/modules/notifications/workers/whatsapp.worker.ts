import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  NotificationLogEntity,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '../../../database/entities/index.js';
import { SignedUrlService } from '../../payments/signed-url.service.js';
import { FonnteProvider } from '../providers/fonnte.provider.js';
import {
  buildWAReminder,
  buildWAConfirmed,
  buildWAOverdue,
} from '../templates/message-templates.js';
import {
  QUEUE_NAMES,
  NotificationJobType,
  type NotificationJobData,
  type PaymentReminderJob,
  type PaymentConfirmedJob,
  type OverdueAlertJob,
} from '../queues/notification.queue.js';

@Processor(QUEUE_NAMES.WHATSAPP)
export class WhatsAppWorker extends WorkerHost {
  private readonly logger = new Logger(WhatsAppWorker.name);

  constructor(
    private readonly fonnteProvider: FonnteProvider,
    private readonly signedUrlService: SignedUrlService,
    @InjectRepository(NotificationLogEntity)
    private readonly notificationLogRepo: Repository<NotificationLogEntity>,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(
      `Processing WhatsApp job ${job.id}: ${job.data.type} for record ${job.data.recordId}`,
    );

    const { type } = job.data;

    try {
      switch (type) {
        case NotificationJobType.PAYMENT_REMINDER:
          await this.handlePaymentReminder(job.data);
          break;

        case NotificationJobType.PAYMENT_CONFIRMED:
          await this.handlePaymentConfirmed(job.data);
          break;

        case NotificationJobType.OVERDUE_ALERT:
          await this.handleOverdueAlert(job.data);
          break;

        case NotificationJobType.GRACE_EXPIRING:
          this.logger.warn(`Grace expiring WhatsApp not implemented yet`);
          break;

        default:
          const _exhaustive: never = type;
          throw new Error(`Unknown job type: ${_exhaustive}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process WhatsApp job ${job.id}: ${(error as Error).message}`,
        error,
      );
      throw error; // Re-throw for BullMQ retry
    }
  }

  // ─── PAYMENT REMINDER ─────────────────────────────────────────────────────

  private async handlePaymentReminder(data: PaymentReminderJob): Promise<void> {
    const {
      recordId,
      memberId,
      periodId,
      memberName,
      memberPhone,
      serviceName,
      hostName,
      amountDue,
      dueDate,
      daysUntilDue,
    } = data;

    if (!memberPhone) {
      this.logger.log(`No phone for member ${memberId}, skipping WhatsApp reminder`);
      return;
    }

    const confirmUrl = this.signedUrlService.generatePaymentConfirmUrl(recordId);

    const message = buildWAReminder({
      memberName,
      serviceName,
      hostName,
      amountDue,
      dueDate,
      daysUntilDue,
      confirmUrl,
    });

    const result = await this.fonnteProvider.sendWhatsApp(memberPhone, message);

    await this.logNotification({
      memberId,
      periodId,
      type: this.mapJobTypeToNotificationType(daysUntilDue),
      channel: NotificationChannel.WHATSAPP,
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: result.success ? new Date() : null,
      metadata: { recordId, messageId: result.messageId, error: result.error },
    });

    if (!result.success) {
      throw new Error(`WhatsApp send failed: ${result.error}`);
    }
  }

  // ─── PAYMENT CONFIRMED ────────────────────────────────────────────────────

  private async handlePaymentConfirmed(data: PaymentConfirmedJob): Promise<void> {
    const { recordId, memberId, periodId, hostPhone, hostName, memberName, serviceName, amountPaid } = data;

    if (!hostPhone) {
      this.logger.log(`No phone for host, skipping WhatsApp confirmed`);
      return;
    }

    const message = buildWAConfirmed({ hostName, memberName, serviceName, amountPaid });

    const result = await this.fonnteProvider.sendWhatsApp(hostPhone, message);

    await this.logNotification({
      memberId,
      periodId,
      type: NotificationType.PAYMENT_CONFIRMED,
      channel: NotificationChannel.WHATSAPP,
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: result.success ? new Date() : null,
      metadata: { recordId, messageId: result.messageId, error: result.error },
    });

    if (!result.success) {
      throw new Error(`WhatsApp send failed: ${result.error}`);
    }
  }

  // ─── OVERDUE ALERT ────────────────────────────────────────────────────────

  private async handleOverdueAlert(data: OverdueAlertJob): Promise<void> {
    const { recordId, memberId, periodId, memberPhone, memberName, serviceName, hostName, amountDue, dueDate, daysOverdue } = data;

    if (!memberPhone) {
      this.logger.log(`No phone for member ${memberId}, skipping WhatsApp overdue`);
      return;
    }

    const confirmUrl = this.signedUrlService.generatePaymentConfirmUrl(recordId);

    const message = buildWAOverdue({ memberName, serviceName, hostName, amountDue, dueDate, daysOverdue, confirmUrl });

    const result = await this.fonnteProvider.sendWhatsApp(memberPhone, message);

    await this.logNotification({
      memberId,
      periodId,
      type: NotificationType.OVERDUE_ALERT,
      channel: NotificationChannel.WHATSAPP,
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: result.success ? new Date() : null,
      metadata: { recordId, messageId: result.messageId, error: result.error, daysOverdue },
    });

    if (!result.success) {
      throw new Error(`WhatsApp send failed: ${result.error}`);
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private mapJobTypeToNotificationType(
    daysUntilDue: number,
  ): NotificationType {
    if (daysUntilDue === 3) return NotificationType.REMINDER_3D;
    if (daysUntilDue === 1) return NotificationType.REMINDER_1D;
    if (daysUntilDue === 0) return NotificationType.REMINDER_0D;
    return NotificationType.REMINDER_3D;
  }

  private async logNotification(
    params: Partial<NotificationLogEntity> & {
      memberId: string;
      type: NotificationType;
      channel: NotificationChannel;
      status: NotificationStatus;
    },
  ): Promise<void> {
    try {
      await this.notificationLogRepo.save(
        this.notificationLogRepo.create(params),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to log notification: ${(error as Error).message}`,
      );
    }
  }
}
