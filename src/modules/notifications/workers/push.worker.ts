import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  NotificationLogEntity,
  PushSubscriptionEntity,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from '../../../database/entities/index.js';
import { VAPIDProvider, type PushPayload } from '../providers/vapid.provider.js';
import {
  QUEUE_NAMES,
  NotificationJobType,
  type NotificationJobData,
  type PaymentReminderJob,
  type PaymentConfirmedJob,
  type OverdueAlertJob,
} from '../queues/notification.queue.js';

@Processor(QUEUE_NAMES.PUSH)
export class PushWorker extends WorkerHost {
  private readonly logger = new Logger(PushWorker.name);

  constructor(
    private readonly vapidProvider: VAPIDProvider,
    @InjectRepository(PushSubscriptionEntity)
    private readonly pushSubRepo: Repository<PushSubscriptionEntity>,
    @InjectRepository(NotificationLogEntity)
    private readonly notificationLogRepo: Repository<NotificationLogEntity>,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(
      `Processing push job ${job.id}: ${job.data.type} for record ${job.data.recordId}`,
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
          this.logger.warn(`Grace expiring push notification not implemented yet`);
          break;

        default:
          const _exhaustive: never = type;
          throw new Error(`Unknown job type: ${_exhaustive}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process push job ${job.id}: ${(error as Error).message}`,
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
      serviceName,
      amountDue,
      daysUntilDue,
    } = data;

    // Find all active push subscriptions for this member's user
    const member = await this.pushSubRepo.manager
      .createQueryBuilder('GroupMemberEntity', 'member')
      .leftJoinAndSelect('member.user', 'user')
      .where('member.id = :memberId', { memberId })
      .getOne();

    if (!member || !member.user) {
      this.logger.warn(`Member ${memberId} has no linked user, skipping push`);
      return;
    }

    const subscriptions = await this.pushSubRepo.find({
      where: { userId: member.user.id },
    });

    if (subscriptions.length === 0) {
      this.logger.log(`No push subscriptions for user ${member.user.id}`);
      return;
    }

    // Build push payload
    const urgencyText =
      daysUntilDue === 0
        ? 'Jatuh Tempo Hari Ini'
        : daysUntilDue === 1
          ? 'Jatuh Tempo Besok'
          : `Jatuh Tempo ${daysUntilDue} Hari Lagi`;

    const payload: PushPayload = {
      title: `Reminder: ${serviceName}`,
      body: `${memberName}, ${urgencyText}. Tagihan: Rp ${parseFloat(amountDue).toLocaleString('id-ID')}`,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: {
        url: `/payments/${recordId}`,
        type: 'payment_reminder',
        recordId,
      },
      actions: [
        {
          action: 'confirm',
          title: 'Sudah Bayar',
        },
        {
          action: 'view',
          title: 'Lihat Detail',
        },
      ],
    };

    // Send to all devices via Promise.allSettled
    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        this.vapidProvider.sendPush(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
        ),
      ),
    );

    // ponytail: Count failures and remove stale subscriptions
    let successCount = 0;
    let failureCount = 0;
    const staleSubscriptions: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const sendResult = result.value;
        if (sendResult.success) {
          successCount++;
        } else {
          failureCount++;
          if (sendResult.shouldRemove) {
            staleSubscriptions.push(subscriptions[index].id);
          }
        }
      } else {
        failureCount++;
      }
    });

    // Remove stale subscriptions (410/404)
    if (staleSubscriptions.length > 0) {
      await this.pushSubRepo.delete(staleSubscriptions);
      this.logger.log(
        `Removed ${staleSubscriptions.length} stale push subscriptions`,
      );
    }

    this.logger.log(
      `Push reminder sent: ${successCount} success, ${failureCount} failed`,
    );

    // Log notification
    await this.logNotification({
      memberId,
      periodId,
      type: this.mapJobTypeToNotificationType(daysUntilDue),
      channel: NotificationChannel.PUSH,
      status:
        successCount > 0 ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: successCount > 0 ? new Date() : null,
      metadata: {
        recordId,
        successCount,
        failureCount,
        staleRemoved: staleSubscriptions.length,
      },
    });
  }

  // ─── PAYMENT CONFIRMED ────────────────────────────────────────────────────

  private async handlePaymentConfirmed(data: PaymentConfirmedJob): Promise<void> {
    const { recordId, memberId, periodId, memberName, serviceName, amountPaid, groupId } = data;

    // Find host's user via group
    const group = await this.pushSubRepo.manager
      .createQueryBuilder('GroupEntity', 'g')
      .leftJoinAndSelect('g.host', 'host')
      .where('g.id = :groupId', { groupId })
      .getOne();

    if (!group) {
      this.logger.warn(`Group ${groupId} not found, skipping push confirmed`);
      return;
    }

    const subscriptions = await this.pushSubRepo.find({
      where: { userId: group.hostId },
    });

    if (subscriptions.length === 0) {
      this.logger.log(`No push subscriptions for host ${group.hostId}`);
      return;
    }

    const payload: PushPayload = {
      title: `Pembayaran Dikonfirmasi: ${serviceName}`,
      body: `${memberName} telah membayar Rp ${parseFloat(amountPaid).toLocaleString('id-ID')}`,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url: `/payments/${recordId}`, type: 'payment_confirmed', recordId },
      actions: [{ action: 'view', title: 'Lihat Detail' }],
    };

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        this.vapidProvider.sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ),
      ),
    );

    let successCount = 0;
    let failureCount = 0;
    const staleSubscriptions: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) { successCount++; }
        else { failureCount++; if (result.value.shouldRemove) { staleSubscriptions.push(subscriptions[index].id); } }
      } else { failureCount++; }
    });

    if (staleSubscriptions.length > 0) {
      await this.pushSubRepo.delete(staleSubscriptions);
      this.logger.log(`Removed ${staleSubscriptions.length} stale push subscriptions`);
    }

    this.logger.log(`Push confirmed: ${successCount} success, ${failureCount} failed`);

    await this.logNotification({
      memberId, periodId,
      type: NotificationType.PAYMENT_CONFIRMED,
      channel: NotificationChannel.PUSH,
      status: successCount > 0 ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: successCount > 0 ? new Date() : null,
      metadata: { recordId, successCount, failureCount, staleRemoved: staleSubscriptions.length },
    });
  }

  // ─── OVERDUE ALERT ────────────────────────────────────────────────────────

  private async handleOverdueAlert(data: OverdueAlertJob): Promise<void> {
    const { recordId, memberId, periodId, memberName, serviceName, amountDue, daysOverdue } = data;

    const member = await this.pushSubRepo.manager
      .createQueryBuilder('GroupMemberEntity', 'm')
      .leftJoinAndSelect('m.user', 'user')
      .where('m.id = :memberId', { memberId })
      .getOne();

    if (!member || !member.user) {
      this.logger.warn(`Member ${memberId} has no linked user, skipping push overdue`);
      return;
    }

    const subscriptions = await this.pushSubRepo.find({
      where: { userId: member.user.id },
    });

    if (subscriptions.length === 0) {
      this.logger.log(`No push subscriptions for user ${member.user.id}`);
      return;
    }

    const payload: PushPayload = {
      title: `Pembayaran Terlambat: ${serviceName}`,
      body: `${memberName}, pembayaran Rp ${parseFloat(amountDue).toLocaleString('id-ID')} terlambat ${daysOverdue} hari. Segera bayar!`,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { url: `/payments/${recordId}`, type: 'overdue_alert', recordId },
      actions: [
        { action: 'confirm', title: 'Sudah Bayar' },
        { action: 'view', title: 'Lihat Detail' },
      ],
    };

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        this.vapidProvider.sendPush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ),
      ),
    );

    let successCount = 0;
    let failureCount = 0;
    const staleSubscriptions: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) { successCount++; }
        else { failureCount++; if (result.value.shouldRemove) { staleSubscriptions.push(subscriptions[index].id); } }
      } else { failureCount++; }
    });

    if (staleSubscriptions.length > 0) {
      await this.pushSubRepo.delete(staleSubscriptions);
      this.logger.log(`Removed ${staleSubscriptions.length} stale push subscriptions`);
    }

    this.logger.log(`Push overdue: ${successCount} success, ${failureCount} failed`);

    await this.logNotification({
      memberId, periodId,
      type: NotificationType.OVERDUE_ALERT,
      channel: NotificationChannel.PUSH,
      status: successCount > 0 ? NotificationStatus.SENT : NotificationStatus.FAILED,
      sentAt: successCount > 0 ? new Date() : null,
      metadata: { recordId, successCount, failureCount, staleRemoved: staleSubscriptions.length, daysOverdue },
    });
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
