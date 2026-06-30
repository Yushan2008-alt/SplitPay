import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentPeriodEntity, PaymentRecordEntity } from '../../database/entities/index.js';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentPeriodEntity, PaymentRecordEntity])],
})
export class PaymentsModule {}
