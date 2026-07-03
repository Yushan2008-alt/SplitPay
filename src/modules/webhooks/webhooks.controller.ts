import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../../common/decorators/public.decorator.js';
import { GatewayProvider } from '../../database/entities/enums.js';
import { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory.js';
import { PAYMENT_WEBHOOK_QUEUE } from './payment-webhook.queue.js';
import { WebhooksService } from './webhooks.service.js';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    @InjectQueue(PAYMENT_WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
  ) {}

  @Post('midtrans')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async handleMidtrans(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    return this.handleGatewayWebhook(
      GatewayProvider.MIDTRANS,
      headers,
      JSON.stringify(body),
    );
  }

  @Post('xendit')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async handleXendit(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    return this.handleGatewayWebhook(
      GatewayProvider.XENDIT,
      headers,
      JSON.stringify(body),
    );
  }

  private async handleGatewayWebhook(
    provider: GatewayProvider,
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ) {
    const gateway = this.gatewayFactory.getGateway({
      paymentProvider: provider,
    } as any);
    const signatureValid = gateway.verifyWebhookSignature(headers, rawBody);
    this.logger.log(`Webhook received from ${provider}: signature_valid=${signatureValid}`);
    const payload = this.safeJson(rawBody);

    const webhookLog = await this.webhooksService.logIncomingWebhook({
      provider,
      eventType: String((payload['transaction_status'] ?? payload['status'] ?? 'unknown') as string),
      payload,
      signatureValid,
      paymentId: String(
        (payload['order_id'] ?? payload['external_id'] ?? '') as string,
      ),
    });

    if (signatureValid) {
      await this.webhookQueue.add(
        'process-webhook',
        {
          provider,
          headers,
          rawBody,
          webhookLogId: webhookLog.id,
        },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnFail: false,
          removeOnComplete: 1000,
        },
      );
    }

    return { received: true };
  }

  private safeJson(rawBody: string): Record<string, unknown> {
    try {
      return JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { rawBody };
    }
  }
}
