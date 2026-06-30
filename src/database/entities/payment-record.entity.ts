// src/database/entities/payment-record.entity.ts
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity.js';
import { PaymentPeriodEntity } from './payment-period.entity.js';
import { GroupMemberEntity } from './group-member.entity.js';
import { PaymentStatus } from './enums.js';

@Entity('payment_records')
export class PaymentRecordEntity extends BaseEntity {
  @ManyToOne(() => PaymentPeriodEntity, (period) => period.paymentRecords, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'period_id' })
  period: PaymentPeriodEntity;

  @Column({ name: 'period_id' })
  periodId: string;

  @ManyToOne(() => GroupMemberEntity, (member) => member.paymentRecords)
  @JoinColumn({ name: 'member_id' })
  member: GroupMemberEntity;

  @Column({ name: 'member_id' })
  memberId: string;

  // [SECURITY] Use DECIMAL for all monetary values
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'amount_due',
  })
  amountDue: string; // TypeORM returns DECIMAL as string

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    name: 'amount_paid',
    nullable: true,
  })
  amountPaid: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    name: 'status',
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ type: 'timestamptz', name: 'confirmed_at', nullable: true })
  confirmedAt: Date | null;

  // [SECURITY] Token untuk signed URL "Sudah Bayar" di email
  // Disimpan ter-hash, bukan plaintext
  @Column({
    type: 'varchar',
    length: 255,
    name: 'confirmation_token_hash',
    nullable: true,
  })
  @Exclude()
  confirmationTokenHash: string | null;

  @Column({
    type: 'timestamptz',
    name: 'token_expires_at',
    nullable: true,
  })
  @Exclude()
  tokenExpiresAt: Date | null;

  // [SECURITY] Flag one-time-use: token hanya bisa dipakai sekali
  @Column({ type: 'boolean', name: 'token_used', default: false })
  @Exclude()
  tokenUsed: boolean;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'payment_method',
    nullable: true,
  })
  paymentMethod: string | null;

  @Column({ type: 'text', name: 'payment_note', nullable: true })
  paymentNote: string | null;

  // Siapa yang mengkonfirmasi: 'self' | 'host' | 'webhook'
  @Column({
    type: 'varchar',
    length: 20,
    name: 'confirmed_by',
    nullable: true,
  })
  confirmedBy: 'self' | 'host' | 'webhook' | null;
}
