import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GroupEntity,
  GroupMemberEntity,
  PaymentPeriodEntity,
  PaymentRecordEntity,
} from '../../database/entities/index.js';
import {
  GroupMemberRepository,
  GroupRepository,
  PaymentPeriodRepository,
  PaymentRecordRepository,
} from '../../database/repositories/index.js';
import { BillingModule } from '../billing/billing.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { SignedUrlService } from './signed-url.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentRecordEntity,
      PaymentPeriodEntity,
      GroupEntity,
      GroupMemberEntity,
    ]),
    BillingModule,
    AuthModule, // For RedisService
    UsersModule, // For UserRepository
    forwardRef(() => NotificationsModule),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentRecordRepository,
    PaymentPeriodRepository,
    GroupRepository,
    GroupMemberRepository,
    SignedUrlService,
  ],
  exports: [PaymentsService, SignedUrlService],
})
export class PaymentsModule {}
