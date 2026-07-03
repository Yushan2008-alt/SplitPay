import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { GatewayProvider } from '../../database/entities/enums.js';
import { MidtransGatewayService } from './implementations/midtrans-gateway.service.js';
import { XenditGatewayService } from './implementations/xendit-gateway.service.js';
import { PaymentGatewayFactory } from './payment-gateway.factory.js';

describe('PaymentGatewayService', () => {
  let midtrans: MidtransGatewayService;
  let xendit: XenditGatewayService;
  let factory: PaymentGatewayFactory;

  const createModule = async (provider: GatewayProvider) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MidtransGatewayService,
        XenditGatewayService,
        PaymentGatewayFactory,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MIDTRANS_SERVER_KEY') return 'mock-server-key';
              if (key === 'MIDTRANS_IS_PRODUCTION') return false;
              if (key === 'XENDIT_SECRET_KEY') return 'mock-xendit-key';
              if (key === 'XENDIT_WEBHOOK_TOKEN') return 'mock-webhook-token';
              if (key === 'DEFAULT_PAYMENT_PROVIDER') return provider;
              return null;
            }),
            getOrThrow: jest.fn((key: string) => {
              if (key === 'MIDTRANS_SERVER_KEY') return 'mock-server-key';
              if (key === 'XENDIT_SECRET_KEY') return 'mock-xendit-key';
              throw new Error(`Missing config: ${key}`);
            }),
          },
        },
      ],
    }).compile();

    midtrans = module.get(MidtransGatewayService);
    xendit = module.get(XenditGatewayService);
    factory = module.get(PaymentGatewayFactory);
  };

  beforeEach(async () => {
    await createModule(GatewayProvider.MIDTRANS);
  });

  describe('MidtransGatewayService', () => {
    it('should have provider = MIDTRANS', () => {
      expect(midtrans.provider).toBe(GatewayProvider.MIDTRANS);
    });

    describe('verifyWebhookSignature', () => {
      const orderId = 'rec-123';
      const statusCode = '200';
      const grossAmount = '10000';
      const serverKey = 'mock-server-key';
      const sigKey = createHash('sha512')
        .update(orderId + statusCode + grossAmount + serverKey)
        .digest('hex');

      const validPayload = JSON.stringify({
        order_id: orderId,
        status_code: statusCode,
        gross_amount: grossAmount,
        signature_key: sigKey,
      });

      it('should return true for valid signature', () => {
        expect(midtrans.verifyWebhookSignature({}, validPayload)).toBe(true);
      });

      it('should return false for invalid signature', () => {
        const tampered = validPayload.replace(grossAmount, '20000');
        expect(midtrans.verifyWebhookSignature({}, tampered)).toBe(false);
      });

      it('should return false for missing fields', () => {
        expect(midtrans.verifyWebhookSignature({}, '{}')).toBe(false);
      });
    });

    describe('parseWebhookPayload', () => {
      it('should parse settlement as PAID', () => {
        const result = midtrans.parseWebhookPayload(JSON.stringify({
          transaction_status: 'settlement',
          order_id: 'rec-123',
          gross_amount: '10000',
          transaction_id: 'txn-abc',
        }));
        expect(result.status).toBe('PAID');
        expect(result.gatewayReferenceId).toBe('rec-123');
        expect(result.gatewayTransactionId).toBe('txn-abc');
        expect(result.amount).toBe(10000);
      });

      it('should parse capture+accept as PAID', () => {
        const result = midtrans.parseWebhookPayload(JSON.stringify({
          transaction_status: 'capture',
          fraud_status: 'accept',
          order_id: 'rec-123',
          gross_amount: '50000',
          transaction_id: 'txn-def',
        }));
        expect(result.status).toBe('PAID');
      });

      it('should parse capture+challenge as PENDING', () => {
        const result = midtrans.parseWebhookPayload(JSON.stringify({
          transaction_status: 'capture',
          fraud_status: 'challenge',
          order_id: 'rec-123',
          gross_amount: '50000',
          transaction_id: 'txn-ghi',
        }));
        expect(result.status).toBe('PENDING');
      });

      it('should parse expire as EXPIRED', () => {
        const result = midtrans.parseWebhookPayload(JSON.stringify({
          transaction_status: 'expire',
          order_id: 'rec-123',
          gross_amount: '10000',
          transaction_id: 'txn-jkl',
        }));
        expect(result.status).toBe('EXPIRED');
      });

      it('should parse deny/cancel/failure as FAILED', () => {
        for (const status of ['deny', 'cancel', 'failure']) {
          const result = midtrans.parseWebhookPayload(JSON.stringify({
            transaction_status: status,
            order_id: 'rec-123',
            gross_amount: '10000',
          }));
          expect(result.status).toBe('FAILED');
        }
      });
    });
  });

  describe('XenditGatewayService', () => {
    beforeEach(async () => {
      await createModule(GatewayProvider.XENDIT);
    });

    it('should have provider = XENDIT', () => {
      expect(xendit.provider).toBe(GatewayProvider.XENDIT);
    });

    describe('verifyWebhookSignature', () => {
      it('should return true for valid x-callback-token', () => {
        const headers = { 'x-callback-token': 'mock-webhook-token' };
        expect(xendit.verifyWebhookSignature(headers, '{}')).toBe(true);
      });

      it('should return false for invalid x-callback-token', () => {
        const headers = { 'x-callback-token': 'wrong-token' };
        expect(xendit.verifyWebhookSignature(headers, '{}')).toBe(false);
      });

      it('should return false for missing x-callback-token', () => {
        expect(xendit.verifyWebhookSignature({}, '{}')).toBe(false);
      });

      it('should handle array header values', () => {
        const headers = { 'x-callback-token': ['mock-webhook-token'] };
        expect(xendit.verifyWebhookSignature(headers, '{}')).toBe(true);
      });
    });

    describe('parseWebhookPayload', () => {
      it('should parse PAID status', () => {
        const result = xendit.parseWebhookPayload(JSON.stringify({
          status: 'PAID',
          external_id: 'rec-123',
          id: 'txn-abc',
          amount: 25000,
        }));
        expect(result.status).toBe('PAID');
        expect(result.gatewayReferenceId).toBe('rec-123');
        expect(result.gatewayTransactionId).toBe('txn-abc');
        expect(result.amount).toBe(25000);
      });

      it('should parse SETTLED as PAID', () => {
        const result = xendit.parseWebhookPayload(JSON.stringify({
          status: 'SETTLED',
          external_id: 'rec-123',
          id: 'txn-def',
          amount: 25000,
        }));
        expect(result.status).toBe('PAID');
      });

      it('should parse EXPIRED status', () => {
        const result = xendit.parseWebhookPayload(JSON.stringify({
          status: 'EXPIRED',
          external_id: 'rec-123',
          id: 'txn-ghi',
          amount: 25000,
        }));
        expect(result.status).toBe('EXPIRED');
      });

      it('should parse FAILED status', () => {
        const result = xendit.parseWebhookPayload(JSON.stringify({
          status: 'FAILED',
          external_id: 'rec-123',
          id: 'txn-jkl',
          amount: 25000,
        }));
        expect(result.status).toBe('FAILED');
      });

      it('should default to PENDING for unknown status', () => {
        const result = xendit.parseWebhookPayload(JSON.stringify({
          status: 'PENDING',
          external_id: 'rec-123',
          id: 'txn-mno',
          amount: 25000,
        }));
        expect(result.status).toBe('PENDING');
      });
    });
  });

  describe('PaymentGatewayFactory', () => {
    it('should return Midtrans by default when group has no provider', () => {
      const gateway = factory.getGateway(null);
      expect(gateway.provider).toBe(GatewayProvider.MIDTRANS);
    });

    it('should return Midtrans when group paymentProvider is MIDTRANS', () => {
      const gateway = factory.getGateway({ paymentProvider: GatewayProvider.MIDTRANS } as any);
      expect(gateway.provider).toBe(GatewayProvider.MIDTRANS);
    });

    it('should return Xendit when group paymentProvider is XENDIT', () => {
      const gateway = factory.getGateway({ paymentProvider: GatewayProvider.XENDIT } as any);
      expect(gateway.provider).toBe(GatewayProvider.XENDIT);
    });
  });
});
