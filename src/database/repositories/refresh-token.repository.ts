import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshTokenEntity } from '../entities/refresh-token.entity.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class RefreshTokenRepository extends BaseRepository<RefreshTokenEntity> {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    repo: Repository<RefreshTokenEntity>,
  ) {
    super(repo);
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenEntity | null> {
    return this.repo.findOne({ where: { tokenHash } });
  }

  async revokeByUserId(userId: string): Promise<void> {
    await this.repo.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
  }

  async revokeByFamilyId(familyId: string): Promise<void> {
    await this.repo.update(
      { familyId, isRevoked: false },
      { isRevoked: true },
    );
  }

  async findActiveByUserId(userId: string): Promise<RefreshTokenEntity[]> {
    return this.repo.find({
      where: { userId, isRevoked: false },
      order: { createdAt: 'DESC' },
    });
  }
}
