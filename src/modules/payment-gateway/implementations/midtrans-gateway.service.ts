import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'crypto';
import { GatewayProvider } from '../../../database/entities/enums.js';
import type {
  CreatePaymentLinkInput,
  NormalizedWebhookEvent,
  PaymentGatewayService,
  PaymentLinkResult,
} from '../payment-gateway.interface.js';

@Injectable()
export class MidtransGatewayService implements PaymentGatewayService {
  readonly provider = GatewayProvider.MIDTRANS;

  constructor(private readonly config: ConfigService) {}

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    const serverKey = this.config.get<string>('MIDTRANS_SERVER_KEY') ?? '';
    const isProd = this.config.get<boolean>('MIDTRANS_IS_PRODUCTION') ?? false;
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);

    const authHeader = `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
    const url = isProd
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

    const resp = await axios.post(
      url,
      {
        transaction_details: {
          order_id: input.paymentId,
          gross_amount: input.amount,
        },
        customer_details: {
          first_name: input.payerName,
        },
        custom_expiry: {
          unit: 'minute',
          duration: input.expiresInMinutes,
          order_time: new Date().toISOString().slice(0, 19) + ' +0700',
        },
        item_details: [
          {
            id: input.paymentId,
            price: input.amount,
            quantity: 1,
            name: input.description,
          },
        ],
      },
      { headers: { Authorization: authHeader } },
    );

    return {
      checkoutUrl: resp.data?.redirect_url ?? null,
      qrisString: null,
      gatewayReferenceId: String(resp.data?.token ?? input.paymentId),
      expiresAt: expiresAt.toISOString(),
    };
  }

  verifyWebhookSignature(
    _headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): boolean {
    const serverKey = this.config.get<string>('MIDTRANS_SERVER_KEY') ?? '';
    if (!serverKey) return false;

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const orderId = String(payload['order_id'] ?? '');
    const statusCode = String(payload['status_code'] ?? '');
    const grossAmount = String(payload['gross_amount'] ?? '');
    const signatureKey = String(payload['signature_key'] ?? '');
    if (!orderId || !statusCode || !grossAmount || !signatureKey) return false;

    const expected = createHash('sha512')
      .update(orderId + statusCode + grossAmount + serverKey)
      .digest('hex');

    return expected === signatureKey;
  }

  parseWebhookPayload(rawBody: string): NormalizedWebhookEvent {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const transactionStatus = String(payload['transaction_status'] ?? '').toLowerCase();
    const fraudStatus = String(payload['fraud_status'] ?? '').toLowerCase();

    let status: NormalizedWebhookEvent['status'] = 'PENDING';
    if (transactionStatus === 'settlement' || transactionStatus === 'capture') {
      status = fraudStatus && fraudStatus !== 'accept' ? 'PENDING' : 'PAID';
    } else if (transactionStatus === 'expire') {
      status = 'EXPIRED';
    } else if (
      transactionStatus === 'deny' ||
      transactionStatus === 'cancel' ||
      transactionStatus === 'failure'
    ) {
      status = 'FAILED';
    }

    return {
      gatewayReferenceId: String(payload['order_id'] ?? ''),
      gatewayTransactionId: String(payload['transaction_id'] ?? payload['order_id'] ?? ''),
      status,
      amount: Math.round(Number(payload['gross_amount'] ?? 0)),
      rawPayload: payload,
    };
  }
}
