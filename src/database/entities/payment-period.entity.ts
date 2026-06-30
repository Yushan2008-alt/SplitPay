// src/database/entities/payment-period.entity.ts
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity.js';
import { GroupEntity } from './group.entity.js';
import { PeriodStatus } from './enums.js';
import type { PaymentRecordEntity } from './payment-record.entity.js';

@Entity('payment_periods')
export class PaymentPeriodEntity extends BaseEntity {
  @ManyToOne(() => GroupEntity, (group) => group.paymentPeriods, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'group_id' })
  group: GroupEntity;

  @Column({ name: 'group_id' })
  groupId: string;

  // DATE type: stored as YYYY-MM-DD, TypeORM returns as string
  @Column({ type: 'date', name: 'period_start' })
  periodStart: string;

  @Column({ type: 'date', name: 'period_end' })
  periodEnd: string;

  @Column({ type: 'date', name: 'due_date' })
  dueDate: string;

  @Column({
    type: 'enum',
    enum: PeriodStatus,
    name: 'status',
    default: PeriodStatus.UPCOMING,
  })
  status: PeriodStatus;

  // [SECURITY] Use DECIMAL for money aggregates
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'total_collected',
    default: 0,
  })
  totalCollected: string; // TypeORM returns DECIMAL as string

  // Relations
  @OneToMany(
    'PaymentRecordEntity',
    (record: PaymentRecordEntity) => record.period,
  )
  paymentRecords: PaymentRecordEntity[];
}
