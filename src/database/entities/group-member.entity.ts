// src/database/entities/group-member.entity.ts
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { SoftDeleteBaseEntity } from './base.entity.js';
import { GroupEntity } from './group.entity.js';
import { UserEntity } from './user.entity.js';
import { MemberRole, MemberStatus, NotificationPreference } from './enums.js';
import type { PaymentRecordEntity } from './payment-record.entity.js';

@Entity('group_members')
export class GroupMemberEntity extends SoftDeleteBaseEntity {
  @ManyToOne(() => GroupEntity, (group) => group.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id' })
  group: GroupEntity;

  @Column({ name: 'group_id' })
  groupId: string;

  // Nullable karena anggota bisa diundang via email sebelum registrasi
  @ManyToOne(() => UserEntity, (user) => user.groupMemberships, {
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity | null;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  // Email wajib ada, dipakai untuk notifikasi jika user belum terdaftar
  @Column({ type: 'varchar', length: 255, name: 'email' })
  email: string;

  @Column({ type: 'varchar', length: 100, name: 'display_name' })
  displayName: string;

  @Column({ type: 'enum', enum: MemberRole, name: 'role' })
  role: MemberRole;

  // Bagian tagihan (decimal, bukan float)
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'share_amount',
  })
  shareAmount: string; // TypeORM returns DECIMAL as string

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    name: 'share_percentage',
    nullable: true,
  })
  sharePercentage: string | null;

  @Column({
    type: 'enum',
    enum: NotificationPreference,
    name: 'notification_preference',
    default: NotificationPreference.BOTH,
  })
  notificationPreference: NotificationPreference;

  @Column({
    type: 'enum',
    enum: MemberStatus,
    name: 'status',
    default: MemberStatus.ACTIVE,
  })
  status: MemberStatus;

  @Column({
    type: 'timestamptz',
    name: 'joined_at',
    default: () => 'NOW()',
  })
  joinedAt: Date;

  // Relations
  @OneToMany(
    'PaymentRecordEntity',
    (record: PaymentRecordEntity) => record.member,
  )
  paymentRecords: PaymentRecordEntity[];
}
