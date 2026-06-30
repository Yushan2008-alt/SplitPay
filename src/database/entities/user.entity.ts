// src/database/entities/user.entity.ts
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { Exclude } from 'class-transformer';
import { SoftDeleteBaseEntity } from './base.entity.js';
import type { GroupEntity } from './group.entity.js';
import type { GroupMemberEntity } from './group-member.entity.js';
import type { RefreshTokenEntity } from './refresh-token.entity.js';
import type { PushSubscriptionEntity } from './push-subscription.entity.js';

@Entity('users')
export class UserEntity extends SoftDeleteBaseEntity {
  // [SECURITY] Index pada email untuk performa query + mencegah duplikasi
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, name: 'email' })
  email: string;

  @Column({ type: 'varchar', length: 100, name: 'name' })
  name: string;

  // [SECURITY] Nomor telepon dienkripsi di level aplikasi sebelum disimpan
  @Column({ type: 'varchar', length: 255, name: 'phone', nullable: true })
  phone: string | null;

  @Column({
    type: 'boolean',
    name: 'is_email_verified',
    default: false,
  })
  isEmailVerified: boolean;

  @Column({
    type: 'timestamptz',
    name: 'last_login_at',
    nullable: true,
  })
  lastLoginAt: Date | null;

  // Relations
  @OneToMany('GroupEntity', (group: GroupEntity) => group.host)
  hostedGroups: GroupEntity[];

  @OneToMany('GroupMemberEntity', (member: GroupMemberEntity) => member.user)
  groupMemberships: GroupMemberEntity[];

  @OneToMany('RefreshTokenEntity', (token: RefreshTokenEntity) => token.user)
  @Exclude()
  refreshTokens: RefreshTokenEntity[];

  @OneToMany(
    'PushSubscriptionEntity',
    (sub: PushSubscriptionEntity) => sub.user,
  )
  pushSubscriptions: PushSubscriptionEntity[];
}
