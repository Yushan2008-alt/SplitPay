import { Column, Entity } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity.js';
import { GatewayProvider } from './enums.js';

@Entity('payment_webhook_logs')
export class PaymentWebhookLogEntity extends BaseEntity {
  @Column({
    type: 'enum',
    enum: GatewayProvider,
    name: 'provider',
  })
  provider: GatewayProvider;

  @Column({ type: 'varchar', length: 100, name: 'event_type' })
  eventType: string;

  // [SECURITY] Raw gateway payload — never expose via API
  @Exclude()
  @Column({ type: 'jsonb', name: 'payload' })
  payload: Record<string, unknown>;

  @Column({ type: 'boolean', name: 'signature_valid' })
  signatureValid: boolean;

  @Column({ type: 'varchar', length: 255, name: 'payment_id', nullable: true })
  paymentId: string | null;

  @Column({ type: 'timestamptz', name: 'processed_at', nullable: true })
  processedAt: Date | null;
}
