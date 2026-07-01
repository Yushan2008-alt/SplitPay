// src/modules/groups/groups.module.ts
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
import { BillingModule } from '../billing/billing.module.js';
import { UsersModule } from '../users/users.module.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      PaymentPeriodEntity,
      PaymentRecordEntity,
    ]),
    UsersModule,
    BillingModule,
  ],
  controllers: [GroupsController],
  providers: [
    GroupsService,
    GroupRepository,
    GroupMemberRepository,
    PaymentPeriodRepository,
    PaymentRecordRepository,
  ],
  exports: [GroupsService, GroupRepository, GroupMemberRepository],
})
export class GroupsModule {}
