import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { GatewayProvider, PaymentStatus, GroupEntity } from '../../database/entities/index.js';
import { PaymentRecordEntity } from '../../database/entities/payment-record.entity.js';
import { PaymentWebhookLogEntity } from '../../database/entities/payment-webhook-log.entity.js';
import { PaymentWebhookLogRepository } from '../../database/repositories/payment-webhook-log.repository.js';
import { GroupMemberRepository } from '../../database/repositories/group-member.repository.js';
import { GroupRepository } from '../../database/repositories/group.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksWorker } from './webhooks.worker.js';
import { PAYMENT_WEBHOOK_QUEUE } from './payment-webhook.queue.js';
import type { PaymentGatewayService, NormalizedWebhookEvent } from '../payment-gateway/payment-gateway.interface.js';

const mockGateway: PaymentGatewayService = {
  provider: GatewayProvider.MIDTRANS,
  createPaymentLink: jest.fn(),
  verifyWebhookSignature: jest.fn().mockReturnValue(true),
  parseWebhookPayload: jest.fn(),
};

const mockWebhookLog: Partial<PaymentWebhookLogEntity> = {
  id: 'log-123',
  provider: GatewayProvider.MIDTRANS,
  eventType: 'settlement',
  payload: {},
  signatureValid: true,
  paymentId: 'rec-123',
  processedAt: null,
};

describe('WebhooksService', () => {
  let service: WebhooksService;
  let dataSource: jest.Mocked<DataSource>;
  let webhookLogRepo: jest.Mocked<PaymentWebhookLogRepository>;
  let gatewayFactory: jest.Mocked<PaymentGatewayFactory>;
  let groupRepo: jest.Mocked<GroupRepository>;
  let memberRepo: jest.Mocked<GroupMemberRepository>;
  let paymentRecordRepo: jest.Mocked<Repository<PaymentRecordEntity>>;

  const mockRecord = {
    id: 'rec-123',
    memberId: 'member-123',
    periodId: 'period-123',
    amountDue: '10000',
    amountPaid: null,
    status: PaymentStatus.AWAITING_GATEWAY,
    gatewayReferenceId: 'ref-123',
    gatewayTransactionId: null,
    paidAt: null,
    confirmedBy: null,
    version: 1,
  } as PaymentRecordEntity;

  const mockNormalizedEvent: NormalizedWebhookEvent = {
    gatewayReferenceId: 'ref-123',
    gatewayTransactionId: 'txn-abc',
    status: 'PAID',
    amount: 10000,
    rawPayload: { transaction_status: 'settlement' },
  };

  beforeEach(async () => {
    const mockDataSource = {
      transaction: jest.fn(),
    };

    const mockWebhookLogRepo = {
      createEntity: jest.fn().mockResolvedValue(mockWebhookLog),
    };

    const mockGatewayFactory = {
      getGateway: jest.fn().mockReturnValue(mockGateway),
    };

    const mockGroupRepo = {
      findById: jest.fn(),
    };

    const mockMemberRepo = {
      findById: jest.fn(),
    };

    const mockPaymentRecordRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockNotificationsService = {
      sendOverdueAlert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: PaymentGatewayFactory, useValue: mockGatewayFactory },
        { provide: PaymentWebhookLogRepository, useValue: mockWebhookLogRepo },
        { provide: GroupRepository, useValue: mockGroupRepo },
        { provide: GroupMemberRepository, useValue: mockMemberRepo },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: 'PaymentRecordEntityRepository', useValue: mockPaymentRecordRepo },
      ],
    }).compile();

    service = module.get(WebhooksService);
    dataSource = module.get(DataSource);
    webhookLogRepo = module.get(PaymentWebhookLogRepository);
    gatewayFactory = module.get(PaymentGatewayFactory);
    groupRepo = module.get(GroupRepository);
    memberRepo = module.get(GroupMemberRepository);
    paymentRecordRepo = module.get('PaymentRecordEntityRepository');
  });

  describe('logIncomingWebhook', () => {
    it('should create webhook log entry', async () => {
      const result = await service.logIncomingWebhook({
        provider: GatewayProvider.MIDTRANS,
        eventType: 'settlement',
        payload: { order_id: 'rec-123' },
        signatureValid: true,
        paymentId: 'rec-123',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('log-123');
      expect(webhookLogRepo.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: GatewayProvider.MIDTRANS,
          signatureValid: true,
        }),
      );
    });
  });
});

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhookQueue: { add: jest.Mock };
  let gatewayFactory: jest.Mocked<PaymentGatewayFactory>;
  let webhooksService: jest.Mocked<WebhooksService>;

  beforeEach(async () => {
    webhookQueue = { add: jest.fn() };
    const mockWebhooksService = {
      logIncomingWebhook: jest.fn().mockResolvedValue({ id: 'log-123' }),
    };
    const mockGatewayFactory = {
      getGateway: jest.fn().mockReturnValue(mockGateway),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: PaymentGatewayFactory, useValue: mockGatewayFactory },
        { provide: 'BullQueue_' + PAYMENT_WEBHOOK_QUEUE, useValue: webhookQueue },
      ],
    }).compile();

    controller = module.get(WebhooksController);
    gatewayFactory = module.get(PaymentGatewayFactory);
    webhooksService = module.get(WebhooksService);
  });

  it('should return { received: true } for valid webhook', async () => {
    const result = await controller.handleMidtrans(
      { 'x-midtrans-signature': 'valid' },
      { order_id: 'rec-123', transaction_status: 'settlement', gross_amount: '10000' },
    );

    expect(result).toEqual({ received: true });
    expect(webhookQueue.add).toHaveBeenCalled();
  });

  it('should log webhook even when signature is invalid', async () => {
    mockGateway.verifyWebhookSignature = jest.fn().mockReturnValue(false);

    await controller.handleMidtrans(
      { 'x-midtrans-signature': 'invalid' },
      { order_id: 'rec-123' },
    );

    expect(webhooksService.logIncomingWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ signatureValid: false }),
    );
    expect(webhookQueue.add).not.toHaveBeenCalled();
  });

  it('should handle Xendit webhook', async () => {
    mockGateway.verifyWebhookSignature = jest.fn().mockReturnValue(true);
    const xenditGateway = {
      ...mockGateway,
      provider: GatewayProvider.XENDIT,
    };
    gatewayFactory.getGateway.mockReturnValue(xenditGateway);

    const result = await controller.handleXendit(
      { 'x-callback-token': 'valid' },
      { external_id: 'rec-123', status: 'PAID', amount: 10000 },
    );

    expect(result).toEqual({ received: true });
  });
});

describe('WebhooksWorker', () => {
  let worker: WebhooksWorker;
  let webhooksService: jest.Mocked<WebhooksService>;

  beforeEach(async () => {
    const mockWebhooksService = {
      processWebhook: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksWorker,
        { provide: WebhooksService, useValue: mockWebhooksService },
      ],
    }).compile();

    worker = module.get(WebhooksWorker);
    webhooksService = module.get(WebhooksService);
  });

  it('should delegate to webhooksService.processWebhook', async () => {
    const job = {
      data: {
        provider: 'midtrans',
        rawBody: '{}',
        headers: {},
        webhookLogId: 'log-123',
      },
    } as any;

    await worker.process(job);
    expect(webhooksService.processWebhook).toHaveBeenCalledWith({
      provider: GatewayProvider.MIDTRANS,
      rawBody: '{}',
      webhookLogId: 'log-123',
    });
  });
});
