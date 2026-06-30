// src/database/entities/otp-code.entity.ts
import { Column, Entity, Index } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity.js';

@Entity('otp_codes')
@Index(['email', 'isUsed', 'expiresAt'])
export class OtpCodeEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255, name: 'email' })
  email: string;

  // [SECURITY] Hash OTP sebelum disimpan (bcrypt/sha256)
  // Jangan simpan OTP plaintext
  @Column({ type: 'varchar', length: 255, name: 'code_hash' })
  @Exclude()
  codeHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'boolean', name: 'is_used', default: false })
  isUsed: boolean;

  // [SECURITY] Batasi percobaan untuk cegah brute force (max 5)
  @Column({ type: 'int', name: 'attempts', default: 0 })
  attempts: number;

  // [SECURITY] Track IP address untuk rate limiting
  @Column({ type: 'inet', name: 'ip_address', nullable: true })
  @Exclude()
  ipAddress: string | null;
}
