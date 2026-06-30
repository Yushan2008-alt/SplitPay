// src/database/entities/base.entity.ts
// Abstract base entities shared by all domain entities.
// BaseEntity: id + timestamps
// SoftDeleteBaseEntity: extends BaseEntity + deletedAt (paranoid mode)

import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

export abstract class SoftDeleteBaseEntity extends BaseEntity {
  // [SECURITY] Soft delete: data tidak benar-benar dihapus dari DB
  // Mencegah kehilangan data audit trail
  @DeleteDateColumn({
    type: 'timestamptz',
    name: 'deleted_at',
    nullable: true,
  })
  @Exclude() // Jangan expose deleted_at ke response
  deletedAt: Date | null;
}
