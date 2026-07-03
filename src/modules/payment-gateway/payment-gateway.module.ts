import { Module } from '@nestjs/common';
import { MidtransGatewayService } from './implementations/midtrans-gateway.service.js';
import { XenditGatewayService } from './implementations/xendit-gateway.service.js';
import { PaymentGatewayFactory } from './payment-gateway.factory.js';

@Module({
  providers: [
    MidtransGatewayService,
    XenditGatewayService,
    PaymentGatewayFactory,
  ],
  exports: [
    MidtransGatewayService,
    XenditGatewayService,
    PaymentGatewayFactory,
  ],
})
export class PaymentGatewayModule {}
