export const PAYMENT_WEBHOOK_QUEUE = 'payment-webhook-queue';

export interface PaymentWebhookJob {
  provider: 'midtrans' | 'xendit';
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  webhookLogId: string;
}
