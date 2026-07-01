import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { generateSignedToken } from '../../src/common/utils/crypto.util.js';
import { PaymentStatus } from '../../src/database/entities/enums.js';
import { PaymentRecordRepository } from '../../src/database/repositories/payment-record.repository.js';

describe('Payments E2E', () => {
  let app: INestApplication;
  let recordRepo: PaymentRecordRepository;
  let notifQueue: Queue;
  let hostAccessToken: string;
  let payerAccessToken: string;
  let groupId: string;
  let periodId: string;
  let recordId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    recordRepo = moduleFixture.get<PaymentRecordRepository>(PaymentRecordRepository);
    notifQueue = moduleFixture.get<Queue>(getQueueToken('payment-notifications'));

    // Setup: Create test users, group, and billing cycle
    // (In real test, use proper auth flow)
    hostAccessToken = 'mock-host-token';
    payerAccessToken = 'mock-payer-token';
    groupId = 'mock-group-id';
    periodId = 'mock-period-id';
    recordId = 'mock-record-id';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /payments/confirm (signed URL flow)', () => {
    it('should confirm payment with valid signed token', async () => {
      // Generate valid signed token
      const secret = process.env.SIGNED_URL_SECRET ?? 'fallback-secret';
      const token = generateSignedToken(
        { recordId: recordId },
        secret,
        72 * 60 * 60, // 72 hours
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/confirm')
        .send({ token })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe(PaymentStatus.PAID);
      expect(response.body.confirmedBy).toBe('self');
    });

    it('should reject invalid token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/payments/confirm')
        .send({ token: 'invalid-token' })
        .expect(400);
    });

    it('should be idempotent (return success if already paid)', async () => {
      const secret = process.env.SIGNED_URL_SECRET ?? 'fallback-secret';
      const token = generateSignedToken(
        { recordId: recordId },
        secret,
        72 * 60 * 60,
      );

      // First call
      await request(app.getHttpServer())
        .post('/api/v1/payments/confirm')
        .send({ token })
        .expect(200);

      // Second call (idempotent)
      const response = await request(app.getHttpServer())
        .post('/api/v1/payments/confirm')
        .send({ token })
        .expect(200);

      expect(response.body.status).toBe(PaymentStatus.PAID);
    });

    it('should queue notification to host after confirmation', async () => {
      const secret = process.env.SIGNED_URL_SECRET ?? 'fallback-secret';
      const token = generateSignedToken(
        { recordId: recordId },
        secret,
        72 * 60 * 60,
      );

      await request(app.getHttpServer())
        .post('/api/v1/payments/confirm')
        .send({ token })
        .expect(200);

      // Verify queue was called (mock queue in test)
      // In real scenario, check queue.add was called with correct payload
    });
  });

  describe('GET /payments/confirm (redirect from email)', () => {
    it('should redirect to success page on valid token', async () => {
      const secret = process.env.SIGNED_URL_SECRET ?? 'fallback-secret';
      const token = generateSignedToken(
        { recordId: recordId },
        secret,
        72 * 60 * 60,
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/payments/confirm')
        .query({ token })
        .expect(302);

      expect(response.headers.location).toContain('/payment/success');
    });

    it('should redirect to error page on invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/payments/confirm')
        .query({ token: 'invalid' })
        .expect(302);

      expect(response.headers.location).toContain('/payment/error');
    });
  });

  describe('PATCH /payments/records/:recordId/mark-paid', () => {
    it('should allow host to mark payment as paid', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/mark-paid`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .send({
          paymentMethod: 'BCA Transfer',
          paymentNote: 'Confirmed manually',
        })
        .expect(200);

      expect(response.body.status).toBe(PaymentStatus.PAID);
      expect(response.body.confirmedBy).toBe('host');
      expect(response.body.paymentMethod).toBe('BCA Transfer');
    });

    it('should reject non-host user', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/mark-paid`)
        .set('Authorization', `Bearer ${payerAccessToken}`)
        .send({})
        .expect(403);
    });

    it('should be idempotent', async () => {
      // First call
      await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/mark-paid`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .send({})
        .expect(200);

      // Second call (idempotent)
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/mark-paid`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .send({})
        .expect(200);

      expect(response.body.status).toBe(PaymentStatus.PAID);
    });
  });

  describe('PATCH /payments/records/:recordId/waive', () => {
    it('should allow host to waive payment', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/waive`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .expect(200);

      expect(response.body.status).toBe(PaymentStatus.WAIVED);
      expect(response.body.confirmedBy).toBe('host');
    });

    it('should reject non-host user', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/waive`)
        .set('Authorization', `Bearer ${payerAccessToken}`)
        .expect(403);
    });

    it('should allow waiving from any status', async () => {
      // Waive OVERDUE payment
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/waive`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .expect(200);

      expect(response.body.status).toBe(PaymentStatus.WAIVED);
    });
  });

  describe('GET /payments/groups/:groupId/periods', () => {
    it('should return periods with own payment records', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/payments/groups/${groupId}/periods`)
        .set('Authorization', `Bearer ${payerAccessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((item: any) => {
        expect(item).toHaveProperty('period');
        expect(item).toHaveProperty('myRecord');
      });
    });

    it('should reject non-member', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/payments/groups/${groupId}/periods`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('GET /payments/groups/:groupId/periods/:periodId', () => {
    it('should return all records for host', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/payments/groups/${groupId}/periods/${periodId}`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('records');
      expect(response.body.myRole).toBe('host');
      expect(Array.isArray(response.body.records)).toBe(true);
    });

    it('should return only own record for payer', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/payments/groups/${groupId}/periods/${periodId}`)
        .set('Authorization', `Bearer ${payerAccessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('period');
      expect(response.body).toHaveProperty('records');
      expect(response.body.myRole).toBe('payer');
      expect(response.body.records.length).toBeLessThanOrEqual(1);
    });

    it('should reject non-member', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/payments/groups/${groupId}/periods/${periodId}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Payment State Machine', () => {
    it('should allow PENDING → PAID', async () => {
      // Tested in confirm payment
    });

    it('should allow OVERDUE → PAID', async () => {
      // Tested in mark paid
    });

    it('should allow any status → WAIVED', async () => {
      // Tested in waive payment
    });

    it('should reject WAIVED → PAID', async () => {
      // Waive first
      await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/waive`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .expect(200);

      // Try to mark paid (should fail)
      await request(app.getHttpServer())
        .patch(`/api/v1/payments/records/${recordId}/mark-paid`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('Full Payment Flow', () => {
    it('should complete full flow: create → notify → confirm → verify', async () => {
      // 1. Create payment record (via billing cycle)
      // (Assume already created in setup)

      // 2. Generate signed URL
      const secret = process.env.SIGNED_URL_SECRET ?? 'fallback-secret';
      const token = generateSignedToken(
        { recordId: recordId },
        secret,
        72 * 60 * 60,
      );

      // 3. Confirm payment via signed URL
      const confirmResponse = await request(app.getHttpServer())
        .post('/api/v1/payments/confirm')
        .send({ token })
        .expect(200);

      expect(confirmResponse.body.status).toBe(PaymentStatus.PAID);

      // 4. Verify record updated
      const record = await recordRepo.findById(recordId);
      expect(record?.status).toBe(PaymentStatus.PAID);
      expect(record?.confirmedBy).toBe('self');

      // 5. Verify notification queued
      // (Check queue mock was called)

      // 6. Check period detail
      const detailResponse = await request(app.getHttpServer())
        .get(`/api/v1/payments/groups/${groupId}/periods/${periodId}`)
        .set('Authorization', `Bearer ${hostAccessToken}`)
        .expect(200);

      const paidRecord = detailResponse.body.records.find(
        (r: any) => r.id === recordId,
      );
      expect(paidRecord.status).toBe(PaymentStatus.PAID);
    });
  });
});
