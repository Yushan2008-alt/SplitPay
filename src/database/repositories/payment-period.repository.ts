import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { PaymentPeriodEntity } from '../entities/payment-period.entity.js';
import { PeriodStatus } from '../entities/enums.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class PaymentPeriodRepository extends BaseRepository<PaymentPeriodEntity> {
  constructor(
    @InjectRepository(PaymentPeriodEntity)
    repo: Repository<PaymentPeriodEntity>,
  ) {
    super(repo);
  }

  async findByGroupId(groupId: string): Promise<PaymentPeriodEntity[]> {
    return this.repo.find({
      where: { groupId },
      order: { periodStart: 'DESC' },
    });
  }

  async findCurrentByGroup(groupId: string): Promise<PaymentPeriodEntity | null> {
    return this.repo.findOne({
      where: { groupId, status: PeriodStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  async findUpcomingByGroup(groupId: string): Promise<PaymentPeriodEntity | null> {
    return this.repo.findOne({
      where: { groupId, status: PeriodStatus.UPCOMING },
      order: { createdAt: 'ASC' },
    });
  }

  async findOverdue(): Promise<PaymentPeriodEntity[]> {
    return this.repo.find({
      where: { status: PeriodStatus.OVERDUE },
      order: { dueDate: 'ASC' },
    });
  }

  async findActivePeriods(): Promise<PaymentPeriodEntity[]> {
    return this.repo.find({
      where: { status: PeriodStatus.ACTIVE },
      order: { dueDate: 'ASC' },
    });
  }
}
