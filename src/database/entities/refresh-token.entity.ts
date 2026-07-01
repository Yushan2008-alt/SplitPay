// src/database/entities/refresh-token.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';

@Entity('refresh_tokens')
export class RefreshTokenEntity extends BaseEntity {
  @ManyToOne(() => UserEntity, (user) => user.refreshTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ name: 'user_id' })
  userId: string;

  // [SECURITY] Simpan hash dari token, bukan plaintext
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, name: 'token_hash' })
  @Exclude()
  tokenHash: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'boolean', name: 'is_revoked', default: false })
  isRevoked: boolean;

  // [SECURITY] familyId groups tokens from same login session.
  // If a token from a family is stolen, the entire family can be revoked.
  @Column({ type: 'varchar', length: 255, name: 'family_id', nullable: true })
  @Exclude()
  familyId: string | null;

  // [SECURITY] Device info untuk multi-device management
  @Column({ type: 'varchar', length: 255, name: 'device_info', nullable: true })
  @Exclude()
  deviceInfo: string | null;

  // [SECURITY] Track device/user-agent untuk deteksi anomali
  @Column({ type: 'text', name: 'user_agent', nullable: true })
  @Exclude()
  userAgent: string | null;

  @Column({ type: 'inet', name: 'ip_address', nullable: true })
  @Exclude()
  ipAddress: string | null;
}
