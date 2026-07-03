import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayProvider, GroupEntity } from '../../database/entities/index.js';
import { MidtransGatewayService } from './implementations/midtrans-gateway.service.js';
import { XenditGatewayService } from './implementations/xendit-gateway.service.js';
import type { PaymentGatewayService } from './payment-gateway.interface.js';

@Injectable()
export class PaymentGatewayFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly midtransGateway: MidtransGatewayService,
    private readonly xenditGateway: XenditGatewayService,
  ) {}

  getGateway(group?: Pick<GroupEntity, 'paymentProvider'> | null): PaymentGatewayService {
    const selected = (group?.paymentProvider ??
      String(this.config.get<string>('DEFAULT_PAYMENT_PROVIDER') ?? 'MIDTRANS')
        .toLowerCase()) as GatewayProvider;

    if (selected === GatewayProvider.XENDIT) return this.xenditGateway;
    return this.midtransGateway;
  }
}
