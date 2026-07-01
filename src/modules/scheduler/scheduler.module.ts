import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GroupEntity,
  GroupMemberEntity,
  PaymentPeriodEntity,
  PaymentRecordEntity,
  UserEntity,
} from '../../database/entities/index.js';
import {
  GroupMemberRepository,
  PaymentPeriodRepository,
  PaymentRecordRepository,
} from '../../database/repositories/index.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      GroupEntity,
      GroupMemberEntity,
      PaymentPeriodEntity,
      PaymentRecordEntity,
      UserEntity,
    ]),
    NotificationsModule,
  ],
  providers: [
    SchedulerService,
    PaymentPeriodRepository,
    PaymentRecordRepository,
    GroupMemberRepository,
  ],
})
export class SchedulerModule {}
