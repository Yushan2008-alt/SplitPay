import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationLogEntity,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '../../../database/entities/index.js';
import { SignedUrlService } from '../../payments/signed-url.service.js';
import { NodemailerProvider } from '../providers/nodemailer.provider.js';
import {
  buildReminderEmailHtml,
  buildConfirmedEmailHtml,
  buildOverdueAlertHtml,
} from '../templates/email-templates.js';
import {
  QUEUE_NAMES,
  NotificationJobType,
  type NotificationJobData,
  type PaymentReminderJob,
  type PaymentConfirmedJob,
  type OverdueAlertJob,
} from '../queues/notification.queue.js';

@Processor(QUEUE_NAMES.EMAIL)
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(
    private readonly nodemailerProvider: NodemailerProvider,
    private readonly signedUrlService: SignedUrlService,
    @InjectRepository(NotificationLogEntity)
    private readonly notificationLogRepo: Repository<NotificationLogEntity>,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(
      `Processing email job ${job.id}: ${job.data.type} for record ${job.data.recordId}`,
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
          // ponytail: Not implemented yet, skip gracefully
          this.logger.warn(`Grace expiring notification not implemented yet`);
          break;

        default:
          // ponytail: Type safety exhaustiveness check
          const _exhaustive: never = type;
          throw new Error(`Unknown job type: ${_exhaustive}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process job ${job.id}: ${(error as Error).message}`,
        error,
      );
      throw error; // Re-throw untuk BullMQ retry mechanism
    }
  }

  // ─── PAYMENT REMINDER ─────────────────────────────────────────────────────

  private async handlePaymentReminder(data: PaymentReminderJob): Promise<void> {
    const {
      recordId,
      memberId,
      periodId,
      memberEmail,
      memberName,
      serviceName,
      hostName,
      amountDue,
      dueDate,
      daysUntilDue,
    } = data;

    // Generate signed URL untuk payment confirmation
    const confirmUrl = this.signedUrlService.generatePaymentConfirmUrl(recordId);

    // Build email HTML
    const html = buildReminderEmailHtml({
      memberName,
      serviceName,
      hostName,
      amountDue,
      dueDate,
      daysUntilDue,
      confirmUrl,
    });

    const subject = `Reminder: Pembayaran ${serviceName} - ${daysUntilDue === 0 ? 'Jatuh Tempo Hari Ini' : daysUntilDue === 1 ? 'Besok' : `${daysUntilDue} Hari Lagi`}`;

    // Send email via Resend
    const result = await this.nodemailerProvider.sendEmail({
      to: memberEmail,
      subject,
      html,
    });

    // Log result to notification_logs table
    await this.logNotification({
      memberId,
      periodId,
      type: this.mapJobTypeToNotificationType(daysUntilDue),
      channel: NotificationChannel.EMAIL,
      status: result.success
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED,
      sentAt: result.success ? new Date() : null,
      metadata: {
        recordId,
        messageId: result.messageId,
        error: result.error,
        to: memberEmail,
        subject,
      },
    });

    if (!result.success) {
      throw new Error(`Email send failed: ${result.error}`);
    }
  }

  // ─── PAYMENT CONFIRMED ────────────────────────────────────────────────────

  private async handlePaymentConfirmed(
    data: PaymentConfirmedJob,
  ): Promise<void> {
    const {
      recordId,
      memberId,
      periodId,
      hostEmail,
      hostName,
      memberName,
      serviceName,
      amountPaid,
      confirmedAt,
    } = data;

    // Build email HTML untuk host
    const html = buildConfirmedEmailHtml({
      hostName,
      memberName,
      serviceName,
      amountPaid,
      confirmedAt,
    });

    const subject = `✓ ${memberName} Sudah Bayar ${serviceName}`;

    // Send email via Resend
    const result = await this.nodemailerProvider.sendEmail({
      to: hostEmail,
      subject,
      html,
    });

    // Log result
    await this.logNotification({
      memberId,
      periodId,
      type: NotificationType.PAYMENT_CONFIRMED,
      channel: NotificationChannel.EMAIL,
      status: result.success
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED,
      sentAt: result.success ? new Date() : null,
      metadata: {
        recordId,
        messageId: result.messageId,
        error: result.error,
        to: hostEmail,
        subject,
      },
    });

    if (!result.success) {
      throw new Error(`Email send failed: ${result.error}`);
    }
  }

  // ─── OVERDUE ALERT ────────────────────────────────────────────────────────

  private async handleOverdueAlert(data: OverdueAlertJob): Promise<void> {
    const {
      recordId,
      memberId,
      periodId,
      memberEmail,
      memberName,
      serviceName,
      hostName,
      amountDue,
      dueDate,
      daysOverdue,
    } = data;

    // Generate signed URL
    const confirmUrl = this.signedUrlService.generatePaymentConfirmUrl(recordId);

    // Build email HTML
    const html = buildOverdueAlertHtml({
      memberName,
      serviceName,
      hostName,
      amountDue,
      dueDate,
      daysOverdue,
      confirmUrl,
    });

    const subject = `⚠️ Pembayaran Terlambat: ${serviceName}`;

    // Send email
    const result = await this.nodemailerProvider.sendEmail({
      to: memberEmail,
      subject,
      html,
    });

    // Log result
    await this.logNotification({
      memberId,
      periodId,
      type: NotificationType.OVERDUE_ALERT,
      channel: NotificationChannel.EMAIL,
      status: result.success
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED,
      sentAt: result.success ? new Date() : null,
      metadata: {
        recordId,
        messageId: result.messageId,
        error: result.error,
        to: memberEmail,
        subject,
        daysOverdue,
      },
    });

    if (!result.success) {
      throw new Error(`Email send failed: ${result.error}`);
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private mapJobTypeToNotificationType(
    daysUntilDue: number,
  ): NotificationType {
    if (daysUntilDue === 3) return NotificationType.REMINDER_3D;
    if (daysUntilDue === 1) return NotificationType.REMINDER_1D;
    if (daysUntilDue === 0) return NotificationType.REMINDER_0D;
    // Default to 3D if unknown
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
      // ponytail: Logging failure is non-fatal, warn and continue
      this.logger.warn(
        `Failed to log notification: ${(error as Error).message}`,
      );
    }
  }
}
