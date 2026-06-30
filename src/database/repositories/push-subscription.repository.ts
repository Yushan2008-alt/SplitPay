import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushSubscriptionEntity } from '../entities/push-subscription.entity.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class PushSubscriptionRepository extends BaseRepository<PushSubscriptionEntity> {
  constructor(
    @InjectRepository(PushSubscriptionEntity)
    repo: Repository<PushSubscriptionEntity>,
  ) {
    super(repo);
  }

  async findByUserId(userId: string): Promise<PushSubscriptionEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscriptionEntity | null> {
    return this.repo.findOne({ where: { endpoint } });
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }
}
