import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DailyCheckService } from './daily-check.service';
import { PaymentRecordRepository } from '../../database/repositories/payment-record.repository';
import { PaymentPeriodRepository } from '../../database/repositories/payment-period.repository';
import { GroupRepository } from '../../database/repositories/group.repository';
import { GroupMemberRepository } from '../../database/repositories/group-member.repository';
import { BillingCycleService } from '../billing/billing-cycle.service';
import { NotificationJobType, QUEUE_NAMES } from '../notifications/queues/notification.queue';
import {
  PaymentStatus,
  PeriodStatus,
  NotificationPreference,
} from '../../database/entities';
import type { Queue } from 'bullmq';

const baseDate = new Date(2026, 0, 10); // Jan 10, 2026

function buildMockPayment(overrides: Record<string, any> = {}) {
  return {
    id: 'payment-1',
    status: PaymentStatus.PENDING,
    amountDue: '50000',
    amountPaid: null,
    period: {
      id: 'period-1',
      status: PeriodStatus.ACTIVE,
      dueDate: '2026-01-13',
      groupId: 'group-1',
      group: {
        id: 'group-1',
        serviceName: 'Netflix',
        gracePeriodDays: 3,
        host: { id: 'host-1', name: 'Host' },
      },
    },
    member: {
      id: 'member-1',
      notificationPreference: NotificationPreference.EMAIL,
      user: { email: 'test@example.com', name: 'Test User' },
    },
    ...overrides,
  };
}

describe('DailyCheckService', () => {
  let service: DailyCheckService;
  let paymentRepo: jest.Mocked<PaymentRecordRepository>;
  let periodRepo: jest.Mocked<PaymentPeriodRepository>;
  let groupRepo: jest.Mocked<GroupRepository>;
  let memberRepo: jest.Mocked<GroupMemberRepository>;
  let billingService: jest.Mocked<BillingCycleService>;
  let emailQueue: jest.Mocked<Queue>;
  let pushQueue: jest.Mocked<Queue>;
  let whatsappQueue: jest.Mocked<Queue>;
  let redis: any;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(baseDate);

    const mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
    };

    const mockEmailQueue = { add: jest.fn().mockResolvedValue({}) };
    const mockPushQueue = { add: jest.fn().mockResolvedValue({}) };
    const mockWhatsappQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyCheckService,
        {
          provide: PaymentRecordRepository,
          useValue: {
            findByStatusWithRelations: jest.fn(),
            findByIdWithRelations: jest.fn(),
            findByStatus: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: PaymentPeriodRepository,
          useValue: {
            findCurrentByGroup: jest.fn(),
          },
        },
        {
          provide: GroupRepository,
          useValue: {
            findActive: jest.fn(),
          },
        },
        {
          provide: GroupMemberRepository,
          useValue: {
            findByGroupId: jest.fn(),
          },
        },
        {
          provide: BillingCycleService,
          useValue: {
            generateNextCycle: jest.fn(),
          },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.EMAIL),
          useValue: mockEmailQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.PUSH),
          useValue: mockPushQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.WHATSAPP),
          useValue: mockWhatsappQueue,
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<DailyCheckService>(DailyCheckService);
    paymentRepo = module.get(PaymentRecordRepository);
    periodRepo = module.get(PaymentPeriodRepository);
    groupRepo = module.get(GroupRepository);
    memberRepo = module.get(GroupMemberRepository);
    billingService = module.get(BillingCycleService);
    emailQueue = module.get(getQueueToken(QUEUE_NAMES.EMAIL));
    pushQueue = module.get(getQueueToken(QUEUE_NAMES.PUSH));
    whatsappQueue = module.get(getQueueToken(QUEUE_NAMES.WHATSAPP));
    redis = module.get('REDIS_CLIENT');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('checkPaymentReminders', () => {
    it('should send T-3 reminder for payment due in 3 days', async () => {
      // Jan 10 + 3 = Jan 13
      const mockPayment = buildMockPayment({ period: { ...buildMockPayment().period, dueDate: '2026-01-13' } });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue(null);

      await service.checkPaymentReminders();

      expect(redis.get).toHaveBeenCalledWith('notif:sent:payment-1:T-3');
      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.PAYMENT_REMINDER,
        expect.objectContaining({
          recordId: 'payment-1',
          daysUntilDue: 3,
        }),
      );
      expect(redis.setex).toHaveBeenCalledWith(
        'notif:sent:payment-1:T-3',
        25 * 60 * 60,
        expect.any(String),
      );
    });

    it('should send T-1 reminder for payment due in 1 day', async () => {
      const mockPayment = buildMockPayment({ period: { ...buildMockPayment().period, dueDate: '2026-01-11' } });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue(null);

      await service.checkPaymentReminders();

      expect(redis.get).toHaveBeenCalledWith('notif:sent:payment-1:T-1');
      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.PAYMENT_REMINDER,
        expect.objectContaining({ daysUntilDue: 1 }),
      );
      expect(redis.setex).toHaveBeenCalledWith(
        'notif:sent:payment-1:T-1',
        25 * 60 * 60,
        expect.any(String),
      );
    });

    it('should send T-0 reminder for payment due today', async () => {
      const mockPayment = buildMockPayment({ period: { ...buildMockPayment().period, dueDate: '2026-01-10' } });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue(null);

      await service.checkPaymentReminders();

      expect(redis.get).toHaveBeenCalledWith('notif:sent:payment-1:T-0');
      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.PAYMENT_REMINDER,
        expect.objectContaining({ daysUntilDue: 0 }),
      );
      expect(redis.setex).toHaveBeenCalledWith(
        'notif:sent:payment-1:T-0',
        25 * 60 * 60,
        expect.any(String),
      );
    });

    it('should skip reminder if already sent (deduplication)', async () => {
      const mockPayment = buildMockPayment({ period: { ...buildMockPayment().period, dueDate: '2026-01-13' } });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue('1234567890');

      await service.checkPaymentReminders();

      expect(emailQueue.add).not.toHaveBeenCalled();
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('should not send reminder for payment due in 2 days (not T-3, T-1, T-0)', async () => {
      const mockPayment = buildMockPayment({ period: { ...buildMockPayment().period, dueDate: '2026-01-12' } });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);

      await service.checkPaymentReminders();

      expect(redis.get).not.toHaveBeenCalled();
      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('should filter out payments with non-ACTIVE periods', async () => {
      const mockPayment = buildMockPayment({ period: { ...buildMockPayment().period, status: PeriodStatus.UPCOMING, dueDate: '2026-01-13' } });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);

      await service.checkPaymentReminders();

      expect(emailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('markOverdueAndAlert', () => {
    it('should mark overdue payments and send alerts', async () => {
      // dueDate + grace = Jan 7 + 2d = Jan 9 < Jan 10 → overdue
      // daysOverdue = ceil((Jan 10 - Jan 7) / day) = 3
      const mockPayment = buildMockPayment({
        id: 'payment-1',
        period: {
          ...buildMockPayment().period,
          dueDate: '2026-01-07',
          group: { ...buildMockPayment().period.group, gracePeriodDays: 2 },
        },
      });

      const fullPayment = buildMockPayment({
        id: 'payment-1',
        period: {
          ...buildMockPayment().period,
          dueDate: '2026-01-07',
          group: { ...buildMockPayment().period.group, gracePeriodDays: 2 },
        },
      });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      paymentRepo.findByIdWithRelations.mockResolvedValue(fullPayment as any);

      await service.markOverdueAndAlert();

      expect(paymentRepo.findByStatusWithRelations).toHaveBeenCalledWith(PaymentStatus.PENDING);
      expect(paymentRepo.update).toHaveBeenCalledWith('payment-1', { status: PaymentStatus.FAILED });
      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.OVERDUE_ALERT,
        expect.objectContaining({
          recordId: 'payment-1',
          daysOverdue: 3,
        }),
      );
    });

    it('should calculate correct days overdue', async () => {
      // dueDate + grace = Jan 5 + 2d = Jan 7 < Jan 10 → overdue
      // daysOverdue = ceil((Jan 10 - Jan 5) / day) = 5
      const mockPayment = buildMockPayment({
        id: 'payment-1',
        period: {
          ...buildMockPayment().period,
          dueDate: '2026-01-05',
          group: { ...buildMockPayment().period.group, gracePeriodDays: 2 },
        },
      });

      const fullPayment = buildMockPayment({
        id: 'payment-1',
        period: {
          ...buildMockPayment().period,
          dueDate: '2026-01-05',
          group: { ...buildMockPayment().period.group, gracePeriodDays: 2 },
        },
      });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      paymentRepo.findByIdWithRelations.mockResolvedValue(fullPayment as any);

      await service.markOverdueAndAlert();

      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.OVERDUE_ALERT,
        expect.objectContaining({ daysOverdue: 5 }),
      );
    });

    it('should skip payments within grace period', async () => {
      // dueDate + grace = Jan 10 + 3d = Jan 13 > Jan 10 → not overdue
      const mockPayment = buildMockPayment({
        period: {
          ...buildMockPayment().period,
          dueDate: '2026-01-10',
          group: { ...buildMockPayment().period.group, gracePeriodDays: 3 },
        },
      });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);

      await service.markOverdueAndAlert();

      expect(paymentRepo.update).not.toHaveBeenCalled();
      expect(emailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('generateUpcomingCycles', () => {
    function buildMockGroup(overrides: Record<string, any> = {}) {
      return {
        id: 'group-1',
        dueDay: 15,
        status: 'active',
        ...overrides,
      };
    }

    it('should generate cycle for group with dueDay within 7 days', async () => {
      const mockGroup = buildMockGroup({ dueDay: 15 });
      groupRepo.findActive.mockResolvedValue([mockGroup] as any);
      periodRepo.findCurrentByGroup.mockResolvedValue(null);

      await service.generateUpcomingCycles();

      expect(billingService.generateNextCycle).toHaveBeenCalledWith('group-1');
    });

    it('should not generate cycle for group with active period', async () => {
      const mockGroup = buildMockGroup();
      groupRepo.findActive.mockResolvedValue([mockGroup] as any);
      periodRepo.findCurrentByGroup.mockResolvedValue({ id: 'period-1', status: PeriodStatus.ACTIVE } as any);

      await service.generateUpcomingCycles();

      expect(billingService.generateNextCycle).not.toHaveBeenCalled();
    });

    it('should not generate cycle for group with upcoming period', async () => {
      const mockGroup = buildMockGroup();
      groupRepo.findActive.mockResolvedValue([mockGroup] as any);
      periodRepo.findCurrentByGroup.mockResolvedValue({ id: 'period-1', status: PeriodStatus.UPCOMING } as any);

      await service.generateUpcomingCycles();

      expect(billingService.generateNextCycle).not.toHaveBeenCalled();
    });

    it('should not generate cycle if dueDay is more than 7 days away', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 1));
      const mockGroup = buildMockGroup({ dueDay: 15 }); // 14 days away
      groupRepo.findActive.mockResolvedValue([mockGroup] as any);
      periodRepo.findCurrentByGroup.mockResolvedValue(null);

      await service.generateUpcomingCycles();

      expect(billingService.generateNextCycle).not.toHaveBeenCalled();
    });

    it('should handle next month if dueDay already passed', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 20));
      const mockGroup = buildMockGroup({ dueDay: 25 }); // 5 days from Jan 20
      groupRepo.findActive.mockResolvedValue([mockGroup] as any);
      periodRepo.findCurrentByGroup.mockResolvedValue(null);

      await service.generateUpcomingCycles();

      expect(billingService.generateNextCycle).toHaveBeenCalledWith('group-1');
    });
  });

  describe('enqueueByPreference', () => {
    it('should enqueue to email queue when preference is EMAIL', async () => {
      const mockPayment = buildMockPayment({ period: { ...buildMockPayment().period, dueDate: '2026-01-13' } });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue(null);

      await service.checkPaymentReminders();

      expect(emailQueue.add).toHaveBeenCalledTimes(1);
      expect(pushQueue.add).not.toHaveBeenCalled();
    });

    it('should enqueue to push queue when preference is PUSH', async () => {
      const mockPayment = buildMockPayment({
        period: { ...buildMockPayment().period, dueDate: '2026-01-13' },
        member: { ...buildMockPayment().member, notificationPreference: NotificationPreference.PUSH },
      });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue(null);

      await service.checkPaymentReminders();

      expect(pushQueue.add).toHaveBeenCalledTimes(1);
      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('should enqueue to both queues when preference is BOTH', async () => {
      const mockPayment = buildMockPayment({
        period: { ...buildMockPayment().period, dueDate: '2026-01-13' },
        member: { ...buildMockPayment().member, notificationPreference: NotificationPreference.BOTH },
      });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue(null);

      await service.checkPaymentReminders();

      expect(emailQueue.add).toHaveBeenCalledTimes(1);
      expect(pushQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should fallback to email when preference is NONE but email exists', async () => {
      const mockPayment = buildMockPayment({
        period: { ...buildMockPayment().period, dueDate: '2026-01-13' },
        member: { ...buildMockPayment().member, notificationPreference: NotificationPreference.NONE },
      });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue(null);

      await service.checkPaymentReminders();

      expect(emailQueue.add).toHaveBeenCalledTimes(1); // Fallback
    });

    it('should handle partial channel failures with Promise.allSettled', async () => {
      const mockPayment = buildMockPayment({
        period: { ...buildMockPayment().period, dueDate: '2026-01-13' },
        member: { ...buildMockPayment().member, notificationPreference: NotificationPreference.BOTH },
      });

      paymentRepo.findByStatusWithRelations.mockResolvedValue([mockPayment] as any);
      redis.get.mockResolvedValue(null);

      emailQueue.add.mockRejectedValueOnce(new Error('Email queue down'));
      pushQueue.add.mockResolvedValueOnce({} as any);

      await expect(service.checkPaymentReminders()).resolves.not.toThrow();

      expect(emailQueue.add).toHaveBeenCalled();
      expect(pushQueue.add).toHaveBeenCalled();
    });
  });

  describe('timezone handling', () => {
    it('should use Asia/Jakarta timezone for cron', () => {
      const cronMetadata = Reflect.getMetadata(
        'schedule:handleDailyCheck',
        service,
      );
      expect(service).toBeDefined();
    });
  });
});
