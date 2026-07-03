import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service.js';
import { PaymentRecordRepository } from '../../database/repositories/payment-record.repository.js';
import { PaymentPeriodRepository } from '../../database/repositories/payment-period.repository.js';
import { GroupRepository } from '../../database/repositories/group.repository.js';
import { GroupMemberRepository } from '../../database/repositories/group-member.repository.js';
import { UserRepository } from '../../database/repositories/user.repository.js';
import { BillingCycleService } from '../billing/billing-cycle.service.js';
import { RedisService } from '../auth/redis.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory.js';
import { generateSignedToken } from '../../common/utils/crypto.util.js';
import {
  GatewayProvider,
  PaymentStatus,
  PaymentConfirmationSource,
  MemberRole,
  MemberStatus,
} from '../../database/entities/enums.js';
import type {
  PaymentRecordEntity,
  GroupEntity,
  GroupMemberEntity,
} from '../../database/entities/index.js';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let recordRepo: jest.Mocked<PaymentRecordRepository>;
  let periodRepo: jest.Mocked<PaymentPeriodRepository>;
  let groupRepo: jest.Mocked<GroupRepository>;
  let memberRepo: jest.Mocked<GroupMemberRepository>;
  let billingService: jest.Mocked<BillingCycleService>;
  let redisService: jest.Mocked<RedisService>;
  let userRepo: jest.Mocked<UserRepository>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let gatewayFactory: jest.Mocked<PaymentGatewayFactory>;

  const mockRecord: Partial<PaymentRecordEntity> = {
    id: 'record-123',
    periodId: 'period-123',
    memberId: 'member-123',
    amountDue: '10000',
    amountPaid: null,
    status: PaymentStatus.PENDING,
    confirmedAt: null,
    confirmedBy: null,
  };

  const mockMember: Partial<GroupMemberEntity> = {
    id: 'member-123',
    groupId: 'group-123',
    userId: 'user-123',
    email: 'member@test.com',
    displayName: 'Test Member',
    role: MemberRole.PAYER,
    status: MemberStatus.ACTIVE,
  };

  const mockGroup: Partial<GroupEntity> = {
    id: 'group-123',
    hostId: 'host-123',
    name: 'Test Group',
  };

  const secret = 'test-secret';
  const validToken = generateSignedToken(
    { recordId: 'record-123' },
    secret,
    3600,
  );

  beforeEach(async () => {
    const mockRecordRepo = {
      findById: jest.fn(),
      update: jest.fn(),
      findByPeriodId: jest.fn(),
      findByMemberId: jest.fn(),
      findByPeriodAndMember: jest.fn(),
      findHistoryByMemberAndFilters: jest.fn(),
    };

    const mockPeriodRepo = {
      findById: jest.fn(),
      findByGroupId: jest.fn(),
    };

    const mockGroupRepo = {
      findById: jest.fn(),
    };

    const mockMemberRepo = {
      findById: jest.fn(),
      findByGroupAndUser: jest.fn(),
      findByUserId: jest.fn(),
    };

    const mockBillingService = {
      updateCycleStatus: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const mockUserRepo = {
      findById: jest.fn(),
    };

    const mockNotificationsService = {
      sendPaymentReminder: jest.fn(),
      sendPaymentConfirmed: jest.fn(),
      sendOverdueAlert: jest.fn(),
    };

    const mockGatewayFactory = {
      getGateway: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentRecordRepository, useValue: mockRecordRepo },
        { provide: PaymentPeriodRepository, useValue: mockPeriodRepo },
        { provide: GroupRepository, useValue: mockGroupRepo },
        { provide: GroupMemberRepository, useValue: mockMemberRepo },
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: BillingCycleService, useValue: mockBillingService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: PaymentGatewayFactory, useValue: mockGatewayFactory },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(secret),
            getOrThrow: jest.fn().mockReturnValue(secret),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    recordRepo = module.get(PaymentRecordRepository);
    periodRepo = module.get(PaymentPeriodRepository);
    groupRepo = module.get(GroupRepository);
    memberRepo = module.get(GroupMemberRepository);
    billingService = module.get(BillingCycleService);
    redisService = module.get(RedisService);
    userRepo = module.get(UserRepository);
    notificationsService = module.get(NotificationsService);
    gatewayFactory = module.get(PaymentGatewayFactory);
  });

  describe('confirmPayment', () => {
    it('should throw BadRequestException for invalid token', async () => {
      await expect(service.confirmPayment('invalid-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return record if token already used (idempotent)', async () => {
      redisService.get.mockResolvedValue('true');
      recordRepo.findById.mockResolvedValue({
        ...mockRecord,
        status: PaymentStatus.PENDING,
      } as any);

      const result = await service.confirmPayment(validToken);
      expect(result).toBeDefined();
    });

    it('should return record if already PAID (idempotent)', async () => {
      const paidRecord = {
        ...mockRecord,
        status: PaymentStatus.PAID,
      } as PaymentRecordEntity;

      redisService.get.mockResolvedValue('true');
      recordRepo.findById.mockResolvedValue(paidRecord);

      const result = await service.confirmPayment(validToken);
      expect(result.status).toBe(PaymentStatus.PAID);
    });

    it('should throw NotFoundException if record not found', async () => {
      redisService.get.mockResolvedValue(null);
      recordRepo.findById.mockResolvedValue(null);

      await expect(service.confirmPayment(validToken)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should transition to PENDING_HOST_REVIEW for valid token', async () => {
      const updatedRecord = {
        ...mockRecord,
        status: PaymentStatus.PENDING_HOST_REVIEW,
      } as PaymentRecordEntity;

      redisService.get.mockResolvedValue(null);
      recordRepo.findById.mockResolvedValue(mockRecord as any);
      recordRepo.update.mockResolvedValue(updatedRecord);

      const result = await service.confirmPayment(validToken);
      expect(result.status).toBe(PaymentStatus.PENDING_HOST_REVIEW);
    });

    it('should throw ConflictException for invalid state transition', async () => {
      const refundedRecord = {
        ...mockRecord,
        status: PaymentStatus.REFUNDED,
      } as PaymentRecordEntity;

      redisService.get.mockResolvedValue(null);
      recordRepo.findById.mockResolvedValue(refundedRecord);

      await expect(service.confirmPayment(validToken)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('hostMarkPaid', () => {
    it('should throw NotFoundException if record not found', async () => {
      recordRepo.findById.mockResolvedValue(null);

      await expect(
        service.hostMarkPaid('record-123', 'host-123', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not host', async () => {
      recordRepo.findById.mockResolvedValue(mockRecord as any);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue({
        ...mockGroup,
        hostId: 'other-host',
      } as any);

      await expect(
        service.hostMarkPaid('record-123', 'host-123', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return record if already PAID (idempotent)', async () => {
      const paidRecord = {
        ...mockRecord,
        status: PaymentStatus.PAID,
      } as PaymentRecordEntity;

      recordRepo.findById.mockResolvedValue(paidRecord);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);

      const result = await service.hostMarkPaid('record-123', 'host-123', {});
      expect(result.status).toBe(PaymentStatus.PAID);
    });

    it('should mark PENDING record as PAID', async () => {
      const updatedRecord = {
        ...mockRecord,
        status: PaymentStatus.PAID,
      } as PaymentRecordEntity;

      recordRepo.findById.mockResolvedValue(mockRecord as any);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      recordRepo.update.mockResolvedValue(updatedRecord);

      const result = await service.hostMarkPaid('record-123', 'host-123', {
        paymentMethod: 'BCA Transfer',
        paymentNote: 'Paid manually',
      });

      expect(recordRepo.update).toHaveBeenCalledWith(
        'record-123',
        expect.objectContaining({
          status: PaymentStatus.PAID,
          confirmedBy: PaymentConfirmationSource.HOST_MANUAL,
          paymentMethod: 'BCA Transfer',
          paymentNote: 'Paid manually',
        }),
      );
      expect(billingService.updateCycleStatus).toHaveBeenCalledWith(
        'period-123',
      );
    });

    it('should throw ConflictException for invalid state transition', async () => {
      const refundedRecord = {
        ...mockRecord,
        status: PaymentStatus.REFUNDED,
      } as PaymentRecordEntity;

      recordRepo.findById.mockResolvedValue(refundedRecord);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);

      await expect(
        service.hostMarkPaid('record-123', 'host-123', {}),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('waivePayment', () => {
    it('should throw NotFoundException if record not found', async () => {
      recordRepo.findById.mockResolvedValue(null);

      await expect(
        service.waivePayment('record-123', 'host-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not host', async () => {
      recordRepo.findById.mockResolvedValue(mockRecord as any);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue({
        ...mockGroup,
        hostId: 'other-host',
      } as any);

      await expect(
        service.waivePayment('record-123', 'host-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should mark PENDING_HOST_REVIEW record as FAILED', async () => {
      const pendingReviewRecord = {
        ...mockRecord,
        status: PaymentStatus.PENDING_HOST_REVIEW,
      } as PaymentRecordEntity;
      const failedRecord = {
        ...mockRecord,
        status: PaymentStatus.FAILED,
      } as PaymentRecordEntity;

      recordRepo.findById.mockResolvedValue(pendingReviewRecord);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      recordRepo.update.mockResolvedValue(failedRecord);

      const result = await service.waivePayment('record-123', 'host-123');
      expect(result.status).toBe(PaymentStatus.FAILED);
    });

    it('should mark PENDING record as FAILED', async () => {
      const failedRecord = {
        ...mockRecord,
        status: PaymentStatus.FAILED,
      } as PaymentRecordEntity;

      recordRepo.findById.mockResolvedValue(mockRecord as any);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      recordRepo.update.mockResolvedValue(failedRecord);

      const result = await service.waivePayment('record-123', 'host-123');

      expect(recordRepo.update).toHaveBeenCalledWith(
        'record-123',
        expect.objectContaining({
          status: PaymentStatus.FAILED,
          confirmedBy: PaymentConfirmationSource.HOST_MANUAL,
        }),
      );
    });

    it('should mark PAID record as REFUNDED', async () => {
      const paidRecord = {
        ...mockRecord,
        status: PaymentStatus.PAID,
      } as PaymentRecordEntity;
      const refundedRecord = {
        ...mockRecord,
        status: PaymentStatus.REFUNDED,
      } as PaymentRecordEntity;

      recordRepo.findById.mockResolvedValue(paidRecord);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      recordRepo.update.mockResolvedValue(refundedRecord);

      const result = await service.waivePayment('record-123', 'host-123');
      expect(result.status).toBe(PaymentStatus.REFUNDED);
    });
  });

  describe('getPeriods', () => {
    it('should throw ForbiddenException if not member', async () => {
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      memberRepo.findByGroupAndUser.mockResolvedValue(null);

      await expect(
        service.getPeriods('group-123', 'random-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return periods with user own record', async () => {
      const periods = [
        { id: 'period-1', groupId: 'group-123', dueDate: '2026-07-01' },
        { id: 'period-2', groupId: 'group-123', dueDate: '2026-08-01' },
      ];
      const records = [
        { id: 'rec-1', periodId: 'period-1', memberId: 'member-123' },
      ];

      groupRepo.findById.mockResolvedValue(mockGroup as any);
      memberRepo.findByGroupAndUser.mockResolvedValue(mockMember as any);
      periodRepo.findByGroupId.mockResolvedValue(periods as any);
      recordRepo.findByMemberId.mockResolvedValue(records as any);

      const result = await service.getPeriods('group-123', 'user-123');

      expect(result).toHaveLength(2);
      expect(result[0].myRecord).toBeDefined();
      expect(result[1].myRecord).toBeNull();
    });

    it('should allow host access even if not member', async () => {
      const hostGroup = { ...mockGroup, hostId: 'host-123' } as GroupEntity;
      const periods = [{ id: 'period-1', groupId: 'group-123' }];

      groupRepo.findById.mockResolvedValue(hostGroup as any);
      memberRepo.findByGroupAndUser.mockResolvedValue(null);
      periodRepo.findByGroupId.mockResolvedValue(periods as any);

      const result = await service.getPeriods('group-123', 'host-123');
      expect(result).toHaveLength(1);
    });
  });

  describe('createGatewayPaymentLink', () => {
    it('should throw NotFoundException if record not found', async () => {
      recordRepo.findById.mockResolvedValue(null);
      await expect(
        service.createGatewayPaymentLink('rec-xxx', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create payment link and transition to AWAITING_GATEWAY', async () => {
      const mockGatewayInstance = {
        provider: GatewayProvider.MIDTRANS,
        createPaymentLink: jest.fn().mockResolvedValue({
          checkoutUrl: 'https://checkout.url',
          qrisString: null,
          gatewayReferenceId: 'ref-123',
          expiresAt: '2026-07-04T00:00:00Z',
        }),
        verifyWebhookSignature: jest.fn(),
        parseWebhookPayload: jest.fn(),
      };

      recordRepo.findById.mockResolvedValue(mockRecord as any);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      recordRepo.update.mockResolvedValue({
        ...mockRecord,
        status: PaymentStatus.AWAITING_GATEWAY,
      } as any);
      gatewayFactory.getGateway = jest.fn().mockReturnValue(mockGatewayInstance);

      const result = await service.createGatewayPaymentLink('record-123', 'user-123');
      expect(result.checkoutUrl).toBe('https://checkout.url');
      expect(result.provider).toBe(GatewayProvider.MIDTRANS);
      expect(recordRepo.update).toHaveBeenCalledWith(
        'record-123',
        expect.objectContaining({
          status: PaymentStatus.AWAITING_GATEWAY,
          gatewayProvider: GatewayProvider.MIDTRANS,
          gatewayReferenceId: 'ref-123',
        }),
      );
    });

    it('should throw ConflictException for invalid state transition', async () => {
      const paidRecord = { ...mockRecord, status: PaymentStatus.PAID } as PaymentRecordEntity;
      const mockGatewayInstance2 = {
        provider: GatewayProvider.MIDTRANS,
        createPaymentLink: jest.fn().mockResolvedValue({
          checkoutUrl: 'https://checkout.url',
          qrisString: null,
          gatewayReferenceId: 'ref-123',
          expiresAt: '2026-07-04T00:00:00Z',
        }),
      };
      recordRepo.findById.mockResolvedValue(paidRecord);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      gatewayFactory.getGateway = jest.fn().mockReturnValue(mockGatewayInstance2);

      await expect(
        service.createGatewayPaymentLink('record-123', 'user-123'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('confirmManual', () => {
    it('should throw ForbiddenException if confirming another member', async () => {
      memberRepo.findById.mockResolvedValue({
        ...mockMember,
        userId: 'other-user',
      } as any);

      await expect(
        service.confirmManual('period-123', 'member-123', 'user-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should transition PENDING to PENDING_HOST_REVIEW', async () => {
      memberRepo.findById.mockResolvedValue(mockMember as any);
      recordRepo.findByPeriodAndMember.mockResolvedValue(mockRecord as any);
      recordRepo.update.mockResolvedValue({
        ...mockRecord,
        status: PaymentStatus.PENDING_HOST_REVIEW,
      } as any);

      const result = await service.confirmManual('period-123', 'member-123', 'user-123');
      expect(recordRepo.update).toHaveBeenCalledWith(
        'record-123',
        expect.objectContaining({
          status: PaymentStatus.PENDING_HOST_REVIEW,
          confirmedBy: PaymentConfirmationSource.MEMBER_SELF_REPORT,
        }),
      );
    });

    it('should throw ConflictException for invalid state transition', async () => {
      const paidRecord = { ...mockRecord, status: PaymentStatus.PAID } as PaymentRecordEntity;
      memberRepo.findById.mockResolvedValue(mockMember as any);
      recordRepo.findByPeriodAndMember.mockResolvedValue(paidRecord);

      await expect(
        service.confirmManual('period-123', 'member-123', 'user-123'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reviewPayment', () => {
    it('should throw BadRequestException for invalid action', async () => {
      await expect(
        (service as any).reviewPayment('record-123', 'host-123', 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should approve PENDING_HOST_REVIEW to PAID', async () => {
      const pendingReviewRecord = {
        ...mockRecord,
        status: PaymentStatus.PENDING_HOST_REVIEW,
      } as PaymentRecordEntity;

      recordRepo.findById.mockResolvedValue(pendingReviewRecord);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      recordRepo.update.mockResolvedValue({
        ...pendingReviewRecord,
        status: PaymentStatus.PAID,
      } as any);

      const result = await service.reviewPayment('record-123', 'host-123', 'approve');
      expect(recordRepo.update).toHaveBeenCalledWith(
        'record-123',
        expect.objectContaining({ status: PaymentStatus.PAID }),
      );
      expect(billingService.updateCycleStatus).toHaveBeenCalledWith('period-123');
    });

    it('should reject PENDING_HOST_REVIEW back to PENDING', async () => {
      const pendingReviewRecord = {
        ...mockRecord,
        status: PaymentStatus.PENDING_HOST_REVIEW,
      } as PaymentRecordEntity;

      recordRepo.findById.mockResolvedValue(pendingReviewRecord);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      recordRepo.update.mockResolvedValue({
        ...pendingReviewRecord,
        status: PaymentStatus.PENDING,
      } as any);

      const result = await service.reviewPayment('record-123', 'host-123', 'reject');
      expect(recordRepo.update).toHaveBeenCalledWith(
        'record-123',
        expect.objectContaining({ status: PaymentStatus.PENDING }),
      );
      expect(billingService.updateCycleStatus).not.toHaveBeenCalled();
    });

    it('should throw ConflictException for invalid review transition', async () => {
      const refundedRecord = { ...mockRecord, status: PaymentStatus.REFUNDED } as PaymentRecordEntity;
      recordRepo.findById.mockResolvedValue(refundedRecord);
      memberRepo.findById.mockResolvedValue(mockMember as any);
      groupRepo.findById.mockResolvedValue(mockGroup as any);

      await expect(
        service.reviewPayment('record-123', 'host-123', 'approve'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getPaymentHistory', () => {
    it('should return payment records for user memberships', async () => {
      const records = [
        { id: 'rec-1', memberId: 'member-123', status: PaymentStatus.PAID },
        { id: 'rec-2', memberId: 'member-123', status: PaymentStatus.PENDING },
      ];

      memberRepo.findByUserId.mockResolvedValue([mockMember] as any);
      recordRepo.findHistoryByMemberAndFilters.mockResolvedValue(records as any);

      const result = await service.getPaymentHistory('user-123');
      expect(result).toHaveLength(2);
      expect(recordRepo.findHistoryByMemberAndFilters).toHaveBeenCalledWith(
        'member-123',
        undefined,
        undefined,
      );
    });

    it('should filter by status and groupId', async () => {
      memberRepo.findByUserId.mockResolvedValue([mockMember] as any);
      recordRepo.findHistoryByMemberAndFilters.mockResolvedValue([] as any);

      await service.getPaymentHistory('user-123', PaymentStatus.PENDING, 'group-456');
      expect(recordRepo.findHistoryByMemberAndFilters).toHaveBeenCalledWith(
        'member-123',
        PaymentStatus.PENDING,
        'group-456',
      );
    });
  });

  describe('getPeriodDetail', () => {
    it('should throw NotFoundException if period not found', async () => {
      groupRepo.findById.mockResolvedValue(mockGroup as any);
      memberRepo.findByGroupAndUser.mockResolvedValue(mockMember as any);
      periodRepo.findById.mockResolvedValue(null);

      await expect(
        service.getPeriodDetail('group-123', 'period-123', 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return all records for HOST', async () => {
      const hostGroup = { ...mockGroup, hostId: 'host-123' } as GroupEntity;
      const period = { id: 'period-123', groupId: 'group-123' };
      const allRecords = [
        { id: 'rec-1', memberId: 'member-1' },
        { id: 'rec-2', memberId: 'member-2' },
      ];

      groupRepo.findById.mockResolvedValue(hostGroup as any);
      periodRepo.findById.mockResolvedValue(period as any);
      recordRepo.findByPeriodId.mockResolvedValue(allRecords as any);

      const result = await service.getPeriodDetail(
        'group-123',
        'period-123',
        'host-123',
      );

      expect(result.myRole).toBe(MemberRole.HOST);
      expect(result.records).toHaveLength(2);
    });

    it('should return only own record for PAYER', async () => {
      const period = { id: 'period-123', groupId: 'group-123' };
      const myRecord = { id: 'rec-1', memberId: 'member-123' };

      groupRepo.findById.mockResolvedValue(mockGroup as any);
      memberRepo.findByGroupAndUser.mockResolvedValue(mockMember as any);
      periodRepo.findById.mockResolvedValue(period as any);
      recordRepo.findByPeriodAndMember.mockResolvedValue(myRecord as any);

      const result = await service.getPeriodDetail(
        'group-123',
        'period-123',
        'user-123',
      );

      expect(result.myRole).toBe(MemberRole.PAYER);
      expect(result.records).toHaveLength(1);
      expect(result.records[0].id).toBe('rec-1');
    });
  });
});
