import { GatewayProvider } from '../../database/entities/enums.js';

export interface CreatePaymentLinkInput {
  paymentId: string;
  amount: number; // integer IDR
  expiresInMinutes: number;
  payerName: string;
  description: string;
}

export interface PaymentLinkResult {
  checkoutUrl: string | null;
  qrisString: string | null;
  gatewayReferenceId: string;
  expiresAt: string;
}

export type NormalizedGatewayStatus =
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'PENDING';

export interface NormalizedWebhookEvent {
  gatewayReferenceId: string;
  gatewayTransactionId: string;
  status: NormalizedGatewayStatus;
  amount: number; // integer IDR
  rawPayload: Record<string, unknown>;
}

export interface PaymentGatewayService {
  readonly provider: GatewayProvider;
  createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLinkResult>;
  verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): boolean;
  parseWebhookPayload(rawBody: string): NormalizedWebhookEvent;
}
