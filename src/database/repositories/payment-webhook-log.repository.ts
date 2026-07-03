import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentWebhookLogEntity } from '../entities/payment-webhook-log.entity.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class PaymentWebhookLogRepository extends BaseRepository<PaymentWebhookLogEntity> {
  constructor(
    @InjectRepository(PaymentWebhookLogEntity)
    repo: Repository<PaymentWebhookLogEntity>,
  ) {
    super(repo);
  }
}
