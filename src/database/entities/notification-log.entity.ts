// src/database/entities/notification-log.entity.ts
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity.js';
import { GroupMemberEntity } from './group-member.entity.js';
import { PaymentPeriodEntity } from './payment-period.entity.js';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
} from './enums.js';

@Entity('notification_logs')
export class NotificationLogEntity extends BaseEntity {
  @ManyToOne(() => GroupMemberEntity)
  @JoinColumn({ name: 'member_id' })
  member: GroupMemberEntity;

  @Column({ name: 'member_id' })
  memberId: string;

  // Nullable: system-wide notifications might not be period-specific
  @ManyToOne(() => PaymentPeriodEntity, { nullable: true })
  @JoinColumn({ name: 'period_id' })
  period: PaymentPeriodEntity | null;

  @Column({ name: 'period_id', nullable: true })
  periodId: string | null;

  @Column({ type: 'enum', enum: NotificationType, name: 'type' })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationChannel, name: 'channel' })
  channel: NotificationChannel;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    name: 'status',
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt: Date | null;

  // Simpan provider response / error message untuk debugging
  // [SECURITY] Jangan expose metadata ke client response
  @Column({ type: 'jsonb', name: 'metadata', nullable: true })
  @Exclude()
  metadata: Record<string, unknown> | null;
}
