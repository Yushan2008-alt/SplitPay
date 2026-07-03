import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  GatewayProvider,
  GroupEntity,
  PaymentConfirmationSource,
  PaymentRecordEntity,
  PaymentStatus,
  PaymentWebhookLogEntity,
} from '../../database/entities/index.js';
import {
  GroupMemberRepository,
  GroupRepository,
  PaymentWebhookLogRepository,
} from '../../database/repositories/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory.js';
import type { NormalizedWebhookEvent } from '../payment-gateway/payment-gateway.interface.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  private readonly webhookTransitionMap: Record<
    PaymentStatus,
    Partial<Record<NormalizedWebhookEvent['status'], PaymentStatus>>
  > = {
    [PaymentStatus.PENDING]: {},
    [PaymentStatus.AWAITING_GATEWAY]: {
      PAID: PaymentStatus.PAID,
      FAILED: PaymentStatus.FAILED,
      EXPIRED: PaymentStatus.EXPIRED,
      PENDING: PaymentStatus.AWAITING_GATEWAY,
    },
    [PaymentStatus.PAID]: { PAID: PaymentStatus.PAID },
    [PaymentStatus.FAILED]: { FAILED: PaymentStatus.FAILED },
    [PaymentStatus.EXPIRED]: { EXPIRED: PaymentStatus.EXPIRED },
    [PaymentStatus.PENDING_HOST_REVIEW]: {},
    [PaymentStatus.REFUNDED]: {},
  };

  constructor(
    private readonly dataSource: DataSource,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly webhookLogRepo: PaymentWebhookLogRepository,
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(PaymentRecordEntity)
    private readonly paymentRecordRepo: Repository<PaymentRecordEntity>,
  ) {}

  async logIncomingWebhook(params: {
    provider: GatewayProvider;
    eventType: string;
    payload: Record<string, unknown>;
    signatureValid: boolean;
    paymentId?: string | null;
  }): Promise<PaymentWebhookLogEntity> {
    return this.webhookLogRepo.createEntity({
      provider: params.provider,
      eventType: params.eventType,
      payload: params.payload,
      signatureValid: params.signatureValid,
      paymentId: params.paymentId ?? null,
      processedAt: null,
    });
  }

  async processWebhook(params: {
    provider: GatewayProvider;
    rawBody: string;
    webhookLogId: string;
  }): Promise<void> {
    const gateway = this.gatewayFactory.getGateway({
      paymentProvider: params.provider,
    } as GroupEntity);
    const event = gateway.parseWebhookPayload(params.rawBody);

    await this.dataSource.transaction(async (manager) => {
      const record = await manager
        .createQueryBuilder(PaymentRecordEntity, 'record')
        .setLock('pessimistic_write')
        .where('record.gatewayReferenceId = :ref', {
          ref: event.gatewayReferenceId,
        })
        .getOne();

      if (!record) {
        throw new NotFoundException(
          `Payment record with gateway_reference_id ${event.gatewayReferenceId} not found`,
        );
      }

      if (
        record.gatewayTransactionId &&
        record.gatewayTransactionId !== event.gatewayTransactionId
      ) {
        throw new ConflictException('Gateway transaction mismatch');
      }

      const amountDue = Math.round(Number(record.amountDue));
      if (amountDue !== event.amount) {
        await manager
          .createQueryBuilder()
          .update(PaymentRecordEntity)
          .set({
            status: PaymentStatus.FAILED,
            gatewayTransactionId: event.gatewayTransactionId,
          })
          .where('id = :id', { id: record.id })
          .execute();
        await manager.increment(PaymentRecordEntity, { id: record.id }, 'version', 1);
        await this.notifyAmountMismatch(record, event.amount);
      } else {
        const nextStatus =
          this.webhookTransitionMap[record.status]?.[event.status] ?? null;
        if (!nextStatus) {
          throw new ConflictException(
            `Illegal transition ${record.status} -> ${event.status}`,
          );
        }

        const paidAt =
          nextStatus === PaymentStatus.PAID ? new Date() : record.paidAt;

        await manager.update(PaymentRecordEntity, record.id, {
          status: nextStatus,
          paidAt,
          confirmedAt: paidAt,
          confirmedBy:
            nextStatus === PaymentStatus.PAID
              ? PaymentConfirmationSource.SYSTEM_WEBHOOK
              : record.confirmedBy,
          gatewayTransactionId: event.gatewayTransactionId,
        });
        await manager.increment(PaymentRecordEntity, { id: record.id }, 'version', 1);
      }

      await manager.update(PaymentWebhookLogEntity, params.webhookLogId, {
        processedAt: new Date(),
      });
    });
  }

  private async notifyAmountMismatch(
    record: PaymentRecordEntity,
    gatewayAmount: number,
  ): Promise<void> {
    const member = await this.memberRepo.findById(record.memberId);
    if (!member) return;
    const group = await this.groupRepo.findById(member.groupId);
    if (!group) return;

    this.logger.warn(
      `Amount mismatch on record ${record.id}: due=${record.amountDue} gateway=${gatewayAmount}`,
    );

    await this.notificationsService.sendOverdueAlert({
      recordId: record.id,
      memberId: member.id,
      groupId: member.groupId,
      periodId: record.periodId,
      amountDue: record.amountDue,
      serviceName: group.serviceName,
      memberName: member.displayName,
      memberEmail: member.email,
      hostName: 'Host',
      dueDate: new Date().toISOString().slice(0, 10),
      daysOverdue: 0,
      notificationPreference: 'email',
    });
  }
}
