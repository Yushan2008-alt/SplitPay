// src/modules/billing/billing.module.ts
import { Module } from '@nestjs/common';
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
import { SplitModule } from '../split/split.module.js';
import { BillingCycleService } from './billing-cycle.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      PaymentPeriodEntity,
      PaymentRecordEntity,
    ]),
    SplitModule,
  ],
  providers: [
    BillingCycleService,
    GroupRepository,
    GroupMemberRepository,
    PaymentPeriodRepository,
    PaymentRecordRepository,
  ],
  exports: [BillingCycleService],
})
export class BillingModule {}
