import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, Repository } from 'typeorm';
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

  async findAllUpcomingByGroup(
    groupId: string,
  ): Promise<PaymentPeriodEntity[]> {
    return this.repo.find({
      where: { groupId, status: PeriodStatus.UPCOMING },
      order: { createdAt: 'ASC' },
    });
  }

  async findCurrentByGroup(
    groupId: string,
  ): Promise<PaymentPeriodEntity | null> {
    // Prefer ACTIVE, fall back to UPCOMING
    const active = await this.repo.findOne({
      where: { groupId, status: PeriodStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
    if (active) return active;
    return this.repo.findOne({
      where: { groupId, status: PeriodStatus.UPCOMING },
      order: { createdAt: 'ASC' },
    });
  }

  async findUpcomingByGroup(
    groupId: string,
  ): Promise<PaymentPeriodEntity | null> {
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

  /**
   * Batch-load current (ACTIVE) or upcoming (UPCOMING) periods for multiple groups.
   * Caller should prefer ACTIVE over UPCOMING per group.
   */
  async findUpcomingDueBetween(
    start: string,
    end: string,
  ): Promise<PaymentPeriodEntity[]> {
    return this.repo.find({
      where: { status: PeriodStatus.UPCOMING, dueDate: Between(start, end) },
      relations: { group: { host: true } },
    });
  }

  async findCurrentOrUpcomingByGroupIds(
    groupIds: string[],
  ): Promise<PaymentPeriodEntity[]> {
    if (groupIds.length === 0) return [];
    return this.repo.find({
      where: [
        { groupId: In(groupIds), status: PeriodStatus.ACTIVE },
        { groupId: In(groupIds), status: PeriodStatus.UPCOMING },
      ],
      order: { createdAt: 'DESC' },
    });
  }
}
