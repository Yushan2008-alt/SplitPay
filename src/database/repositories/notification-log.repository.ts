import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationLogEntity } from '../entities/notification-log.entity.js';
import { NotificationStatus, NotificationType } from '../entities/enums.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class NotificationLogRepository extends BaseRepository<NotificationLogEntity> {
  constructor(
    @InjectRepository(NotificationLogEntity)
    repo: Repository<NotificationLogEntity>,
  ) {
    super(repo);
  }

  async findByMemberId(memberId: string): Promise<NotificationLogEntity[]> {
    return this.repo.find({
      where: { memberId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByPeriodId(periodId: string): Promise<NotificationLogEntity[]> {
    return this.repo.find({
      where: { periodId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByMemberAndType(
    memberId: string,
    type: NotificationType,
  ): Promise<NotificationLogEntity[]> {
    return this.repo.find({
      where: { memberId, type },
      order: { createdAt: 'DESC' },
    });
  }

  async findByStatus(status: NotificationStatus): Promise<NotificationLogEntity[]> {
    return this.repo.find({
      where: { status },
      order: { createdAt: 'ASC' },
    });
  }

  async markSent(id: string): Promise<void> {
    await this.repo.update(id, {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.repo.update(id, { status: NotificationStatus.FAILED });
  }
}
