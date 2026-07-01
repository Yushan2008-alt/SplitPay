// src/modules/members/members.module.ts
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
import { UsersModule } from '../users/users.module.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([GroupEntity, GroupMemberEntity, PaymentPeriodEntity, PaymentRecordEntity]),
    UsersModule,
    SplitModule,
  ],
  controllers: [MembersController],
  providers: [
    MembersService,
    GroupRepository,
    GroupMemberRepository,
    PaymentPeriodRepository,
    PaymentRecordRepository,
  ],
  exports: [MembersService],
})
export class MembersModule {}
