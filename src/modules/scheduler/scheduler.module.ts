import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import {
  PaymentPeriodEntity,
  PaymentRecordEntity,
  GroupEntity,
  GroupMemberEntity,
} from '../../database/entities/index.js';
import { PaymentPeriodRepository } from '../../database/repositories/payment-period.repository.js';
import { PaymentRecordRepository } from '../../database/repositories/payment-record.repository.js';
import { GroupRepository } from '../../database/repositories/group.repository.js';
import { GroupMemberRepository } from '../../database/repositories/group-member.repository.js';
import { QUEUE_NAMES } from '../notifications/queues/notification.queue.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AuthModule } from '../auth/auth.module.js'; // For RedisService
import { DailyCheckService } from './daily-check.service.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      PaymentPeriodEntity,
      PaymentRecordEntity,
      GroupEntity,
      GroupMemberEntity,
    ]),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.PUSH },
      { name: QUEUE_NAMES.WHATSAPP },
    ),
    PaymentsModule,
    BillingModule,
    NotificationsModule,
    AuthModule, // For RedisService
  ],
  providers: [
    DailyCheckService,
    SchedulerService,
    PaymentPeriodRepository,
    PaymentRecordRepository,
    GroupRepository,
    GroupMemberRepository,
  ],
  exports: [DailyCheckService, SchedulerService],
})
export class SchedulerModule {}
