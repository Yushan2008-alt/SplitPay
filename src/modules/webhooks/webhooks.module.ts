import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentRecordEntity, PaymentWebhookLogEntity } from '../../database/entities/index.js';
import {
  GroupMemberRepository,
  GroupRepository,
  PaymentWebhookLogRepository,
} from '../../database/repositories/index.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module.js';
import { PAYMENT_WEBHOOK_QUEUE } from './payment-webhook.queue.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksWorker } from './webhooks.worker.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentRecordEntity, PaymentWebhookLogEntity]),
    BullModule.registerQueue({ name: PAYMENT_WEBHOOK_QUEUE }),
    PaymentGatewayModule,
    NotificationsModule,
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhooksWorker,
    PaymentWebhookLogRepository,
    GroupRepository,
    GroupMemberRepository,
  ],
})
export class WebhooksModule {}
