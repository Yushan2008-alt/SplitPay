import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { NotificationLogEntity, PushSubscriptionEntity } from '../../database/entities/index.js';
import { PushSubscriptionRepository } from '../../database/repositories/push-subscription.repository.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { NotificationsService } from './notifications.service.js';
import { NodemailerProvider } from './providers/nodemailer.provider.js';
import { VAPIDProvider } from './providers/vapid.provider.js';
import { FonnteProvider } from './providers/fonnte.provider.js';
import { EmailWorker } from './workers/email.worker.js';
import { PushWorker } from './workers/push.worker.js';
import { WhatsAppWorker } from './workers/whatsapp.worker.js';
import { PushSubscriptionController } from './push-subscription.controller.js';
import { PushSubscriptionService } from './push-subscription.service.js';
import { QUEUE_NAMES } from './queues/notification.queue.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLogEntity, PushSubscriptionEntity]),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.PUSH },
      { name: QUEUE_NAMES.WHATSAPP },
    ),
    forwardRef(() => PaymentsModule), // For SignedUrlService
  ],
  controllers: [PushSubscriptionController],
  providers: [
    NotificationsService,
    PushSubscriptionService,
    NodemailerProvider,
    VAPIDProvider,
    FonnteProvider,
    EmailWorker, // BullMQ workers auto-registered via @Processor decorator
    PushWorker,
    WhatsAppWorker,
    PushSubscriptionRepository,
  ],
  exports: [NotificationsService, PushSubscriptionService],
})
export class NotificationsModule {}
