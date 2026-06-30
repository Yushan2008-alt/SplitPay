// src/database/entities/push-subscription.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';

@Entity('push_subscriptions')
export class PushSubscriptionEntity extends BaseEntity {
  @ManyToOne(() => UserEntity, (user) => user.pushSubscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'user_id' })
  userId: string;

  // [SECURITY] Endpoint unik per device/browser
  @Index({ unique: true })
  @Column({ type: 'text', name: 'endpoint' })
  endpoint: string;

  // Web Push VAPID keys — exclude from API responses
  @Column({ type: 'text', name: 'p256dh' })
  @Exclude()
  p256dh: string;

  @Column({ type: 'text', name: 'auth' })
  @Exclude()
  auth: string;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  @Exclude()
  userAgent: string | null;
}
