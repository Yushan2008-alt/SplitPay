import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationLogEntity, PushSubscriptionEntity } from '../../database/entities/index.js';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationLogEntity, PushSubscriptionEntity])],
})
export class NotificationsModule {}
