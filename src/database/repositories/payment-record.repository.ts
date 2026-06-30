import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentRecordEntity } from '../entities/payment-record.entity.js';
import { PaymentStatus } from '../entities/enums.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class PaymentRecordRepository extends BaseRepository<PaymentRecordEntity> {
  constructor(
    @InjectRepository(PaymentRecordEntity)
    repo: Repository<PaymentRecordEntity>,
  ) {
    super(repo);
  }

  async findByPeriodId(periodId: string): Promise<PaymentRecordEntity[]> {
    return this.repo.find({
      where: { periodId },
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
}
