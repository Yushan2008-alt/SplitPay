import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GatewayProvider } from '../../../database/entities/enums.js';
import type {
  CreatePaymentLinkInput,
  NormalizedWebhookEvent,
  PaymentGatewayService,
  PaymentLinkResult,
} from '../payment-gateway.interface.js';

@Injectable()
export class XenditGatewayService implements PaymentGatewayService {
  readonly provider = GatewayProvider.XENDIT;

  constructor(private readonly config: ConfigService) {}

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult> {
    const apiKey = this.config.get<string>('XENDIT_SECRET_KEY') ?? '';
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);

    const resp = await axios.post(
      'https://api.xendit.co/v2/invoices',
      {
        external_id: input.paymentId,
        amount: input.amount,
        invoice_duration: input.expiresInMinutes * 60,
        description: input.description,
        customer: {
          given_names: input.payerName,
        },
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        },
      },
    );

    return {
      checkoutUrl: resp.data?.invoice_url ?? null,
      qrisString: null,
      gatewayReferenceId: String(resp.data?.external_id ?? input.paymentId),
      expiresAt: String(resp.data?.expiry_date ?? expiresAt.toISOString()),
    };
  }

  verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    _rawBody: string,
  ): boolean {
    const expected = this.config.get<string>('XENDIT_WEBHOOK_TOKEN') ?? '';
    if (!expected) return false;
    const received = headers['x-callback-token'];
    const token = Array.isArray(received) ? received[0] : received;
    return token === expected;
  }

  parseWebhookPayload(rawBody: string): NormalizedWebhookEvent {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const statusRaw = String(payload['status'] ?? '').toUpperCase();

    let status: NormalizedWebhookEvent['status'] = 'PENDING';
    if (statusRaw === 'PAID' || statusRaw === 'SETTLED') status = 'PAID';
    else if (statusRaw === 'EXPIRED') status = 'EXPIRED';
    else if (statusRaw === 'FAILED') status = 'FAILED';

    return {
      gatewayReferenceId: String(payload['external_id'] ?? ''),
      gatewayTransactionId: String(payload['id'] ?? payload['external_id'] ?? ''),
      status,
      amount: Math.round(Number(payload['amount'] ?? 0)),
      rawPayload: payload,
    };
  }
}
