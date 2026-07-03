import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentRecordEntity } from '../entities/payment-record.entity.js';
import { PaymentStatus, PeriodStatus } from '../entities/enums.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class PaymentRecordRepository extends BaseRepository<PaymentRecordEntity> {
  constructor(
    @InjectRepository(PaymentRecordEntity)
    repo: Repository<PaymentRecordEntity>,
  ) {
    super(repo);
  }

  async findPendingByPeriodId(periodId: string): Promise<PaymentRecordEntity[]> {
    return this.repo.find({
      where: { periodId, status: PaymentStatus.PENDING },
      relations: { member: { user: true } },
    });
  }

  async findByPeriodId(periodId: string): Promise<PaymentRecordEntity[]> {
    return this.repo.find({
      where: { periodId },
      relations: { member: true },
      order: { createdAt: 'ASC' },
    });
  }

  async findByMemberId(memberId: string): Promise<PaymentRecordEntity[]> {
    return this.repo.find({
      where: { memberId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByPeriodAndMember(
    periodId: string,
    memberId: string,
  ): Promise<PaymentRecordEntity | null> {
    return this.repo.findOne({ where: { periodId, memberId } });
  }

  async findByStatus(status: PaymentStatus): Promise<PaymentRecordEntity[]> {
    return this.repo.find({
      where: { status },
      order: { createdAt: 'DESC' },
    });
  }

  async findByStatusWithRelations(status: PaymentStatus): Promise<PaymentRecordEntity[]> {
    return this.repo.find({
      where: { status },
      relations: { period: { group: { host: true } }, member: { user: true } },
      order: { createdAt: 'DESC' },
    });
  }

  async findByIdWithRelations(id: string): Promise<PaymentRecordEntity | null> {
    return this.repo.findOne({
      where: { id },
      relations: { period: { group: { host: true } }, member: { user: true } },
    });
  }

  async sumAmountCollectedByPeriod(
    periodId: string,
  ): Promise<string> {
    const result = await this.repo
      .createQueryBuilder('pr')
      .select('COALESCE(SUM(CAST(pr.amount_paid AS DECIMAL(15,2))), 0)', 'total')
      .where('pr.period_id = :periodId', { periodId })
      .andWhere('pr.status = :status', { status: PaymentStatus.PAID })
      .getRawOne();
    return result?.total ?? '0';
  }

  async countByPeriodAndStatus(
    periodId: string,
    status: PaymentStatus,
  ): Promise<number> {
    return this.repo.count({ where: { periodId, status } });
  }

  async findByGatewayReferenceId(
    gatewayReferenceId: string,
  ): Promise<PaymentRecordEntity | null> {
    return this.repo.findOne({ where: { gatewayReferenceId } });
  }

  async findHistoryByMemberAndFilters(
    memberId: string,
    status?: PaymentStatus,
    groupId?: string,
  ): Promise<PaymentRecordEntity[]> {
    const qb = this.repo
      .createQueryBuilder('record')
      .innerJoinAndSelect('record.period', 'period')
      .innerJoinAndSelect('period.group', 'group')
      .where('record.member_id = :memberId', { memberId })
      .orderBy('period.due_date', 'DESC');

    if (status) qb.andWhere('record.status = :status', { status });
    if (groupId) qb.andWhere('period.group_id = :groupId', { groupId });

    return qb.getMany();
  }
}
