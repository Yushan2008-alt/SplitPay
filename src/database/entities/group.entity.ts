// src/database/entities/group.entity.ts
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { SoftDeleteBaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import {
  BillingFrequency,
  GatewayProvider,
  GroupStatus,
  SplitMethod,
} from './enums.js';
import type { GroupMemberEntity } from './group-member.entity.js';
import type { PaymentPeriodEntity } from './payment-period.entity.js';

@Entity('groups')
export class GroupEntity extends SoftDeleteBaseEntity {
  @ManyToOne(() => UserEntity, (user) => user.hostedGroups)
  @JoinColumn({ name: 'host_id' })
  host: UserEntity;

  @Column({ name: 'host_id' })
  hostId: string;

  @Column({ type: 'varchar', length: 100, name: 'name' })
  name: string;

  @Column({ type: 'varchar', length: 100, name: 'service_name' })
  serviceName: string; // e.g. "Netflix", "Spotify"

  @Column({ type: 'text', name: 'description', nullable: true })
  description: string | null;

  // [SECURITY] Gunakan 'decimal' bukan 'float' untuk nilai uang
  // Hindari floating point precision bug
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'total_amount',
  })
  totalAmount: string; // TypeORM returns DECIMAL as string, parse to number when needed

  @Column({
    type: 'enum',
    enum: BillingFrequency,
    name: 'frequency',
  })
  frequency: BillingFrequency;

  // Tanggal jatuh tempo (1–28, aman untuk semua bulan)
  @Column({ type: 'smallint', name: 'due_day' })
  dueDay: number;

  @Column({ type: 'enum', enum: SplitMethod, name: 'split_method' })
  splitMethod: SplitMethod;

  // Grace period setelah jatuh tempo (dalam hari)
  @Column({
    type: 'smallint',
    name: 'grace_period_days',
    default: 3,
  })
  gracePeriodDays: number;

  @Column({
    type: 'enum',
    enum: GroupStatus,
    name: 'status',
    default: GroupStatus.ACTIVE,
  })
  status: GroupStatus;

  @Column({
    type: 'enum',
    enum: GatewayProvider,
    name: 'payment_provider',
    nullable: true,
  })
  paymentProvider: GatewayProvider | null;

  // Relations
  @OneToMany('GroupMemberEntity', (member: GroupMemberEntity) => member.group)
  members: GroupMemberEntity[];

  @OneToMany(
    'PaymentPeriodEntity',
    (period: PaymentPeriodEntity) => period.group,
  )
  paymentPeriods: PaymentPeriodEntity[];
}
