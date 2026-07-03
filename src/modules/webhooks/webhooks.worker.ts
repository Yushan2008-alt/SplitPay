import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GatewayProvider } from '../../database/entities/enums.js';
import { PAYMENT_WEBHOOK_QUEUE, type PaymentWebhookJob } from './payment-webhook.queue.js';
import { WebhooksService } from './webhooks.service.js';

@Processor(PAYMENT_WEBHOOK_QUEUE, { concurrency: 10 })
export class WebhooksWorker extends WorkerHost {
  constructor(private readonly webhooksService: WebhooksService) {
    super();
  }

  async process(job: Job<PaymentWebhookJob>): Promise<void> {
    await this.webhooksService.processWebhook({
      provider: job.data.provider as GatewayProvider,
      rawBody: job.data.rawBody,
      webhookLogId: job.data.webhookLogId,
    });
  }
}
