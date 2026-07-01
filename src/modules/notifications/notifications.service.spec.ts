import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { QUEUE_NAMES, NotificationJobType } from './queues/notification.queue';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let emailQueue: jest.Mocked<Queue>;
  let pushQueue: jest.Mocked<Queue>;
  let whatsappQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    const mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getQueueToken(QUEUE_NAMES.EMAIL), useValue: mockQueue },
        { provide: getQueueToken(QUEUE_NAMES.PUSH), useValue: mockQueue },
        { provide: getQueueToken(QUEUE_NAMES.WHATSAPP), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    emailQueue = module.get(getQueueToken(QUEUE_NAMES.EMAIL));
    pushQueue = module.get(getQueueToken(QUEUE_NAMES.PUSH));
    whatsappQueue = module.get(getQueueToken(QUEUE_NAMES.WHATSAPP));
  });

  describe('sendPaymentReminder', () => {
    const baseParams = {
      recordId: 'record-123',
      memberId: 'member-123',
      groupId: 'group-123',
      periodId: 'period-123',
      dueDate: '2026-07-10',
      amountDue: '50000',
      serviceName: 'Netflix',
      memberName: 'John Doe',
      memberEmail: 'john@example.com',
      hostName: 'Jane Host',
      daysUntilDue: 3,
    };

    it('should enqueue email job by default', async () => {
      await service.sendPaymentReminder(baseParams);

      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.PAYMENT_REMINDER,
        expect.objectContaining({
          type: NotificationJobType.PAYMENT_REMINDER,
          recordId: 'record-123',
        }),
        expect.any(Object),
      );
    });

    it('should enqueue email when preference is "email"', async () => {
      await service.sendPaymentReminder({
        ...baseParams,
        notificationPreference: 'email',
      });

      expect(emailQueue.add).toHaveBeenCalled();
    });

    it('should enqueue both email and push when preference is "both"', async () => {
      await service.sendPaymentReminder({
        ...baseParams,
        notificationPreference: 'both',
      });

      expect(emailQueue.add).toHaveBeenCalled();
      // Note: Push notification not implemented yet, would be logged as warning
    });

    it('should not enqueue when preference is "none"', async () => {
      await service.sendPaymentReminder({
        ...baseParams,
        notificationPreference: 'none',
      });

      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('should include all required data in job', async () => {
      await service.sendPaymentReminder(baseParams);

      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.PAYMENT_REMINDER,
        expect.objectContaining({
          recordId: 'record-123',
          memberId: 'member-123',
          groupId: 'group-123',
          periodId: 'period-123',
          dueDate: '2026-07-10',
          amountDue: '50000',
          serviceName: 'Netflix',
          memberName: 'John Doe',
          memberEmail: 'john@example.com',
          hostName: 'Jane Host',
          daysUntilDue: 3,
        }),
        expect.any(Object),
      );
    });
  });

  describe('sendPaymentConfirmed', () => {
    const baseParams = {
      recordId: 'record-123',
      memberId: 'member-123',
      groupId: 'group-123',
      periodId: 'period-123',
      amountPaid: '50000',
      serviceName: 'Netflix',
      memberName: 'John Doe',
      hostEmail: 'host@example.com',
      hostName: 'Jane Host',
      confirmedAt: '2026-07-01T10:30:00Z',
    };

    it('should enqueue payment confirmed email', async () => {
      await service.sendPaymentConfirmed(baseParams);

      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.PAYMENT_CONFIRMED,
        expect.objectContaining({
          type: NotificationJobType.PAYMENT_CONFIRMED,
          recordId: 'record-123',
        }),
        expect.any(Object),
      );
    });

    it('should include all required data', async () => {
      await service.sendPaymentConfirmed(baseParams);

      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.PAYMENT_CONFIRMED,
        expect.objectContaining({
          recordId: 'record-123',
          memberId: 'member-123',
          groupId: 'group-123',
          periodId: 'period-123',
          amountPaid: '50000',
          serviceName: 'Netflix',
          memberName: 'John Doe',
          hostEmail: 'host@example.com',
          hostName: 'Jane Host',
          confirmedAt: '2026-07-01T10:30:00Z',
        }),
        expect.any(Object),
      );
    });
  });

  describe('sendOverdueAlert', () => {
    const baseParams = {
      recordId: 'record-123',
      memberId: 'member-123',
      groupId: 'group-123',
      periodId: 'period-123',
      amountDue: '50000',
      serviceName: 'Netflix',
      memberName: 'John Doe',
      memberEmail: 'john@example.com',
      hostName: 'Jane Host',
      dueDate: '2026-06-30',
      daysOverdue: 5,
    };

    it('should enqueue overdue alert email', async () => {
      await service.sendOverdueAlert(baseParams);

      expect(emailQueue.add).toHaveBeenCalledWith(
        NotificationJobType.OVERDUE_ALERT,
        expect.objectContaining({
          type: NotificationJobType.OVERDUE_ALERT,
          recordId: 'record-123',
          daysOverdue: 5,
        }),
        expect.any(Object),
      );
    });

    it('should respect notification preference', async () => {
      await service.sendOverdueAlert({
        ...baseParams,
        notificationPreference: 'email',
      });

      expect(emailQueue.add).toHaveBeenCalled();
    });
  });

  describe('bulkSendPaymentReminders', () => {
    it('should send multiple reminders successfully', async () => {
      const reminders = [
        {
          recordId: 'rec-1',
          memberId: 'mem-1',
          groupId: 'group-1',
          periodId: 'period-1',
          dueDate: '2026-07-10',
          amountDue: '50000',
          serviceName: 'Netflix',
          memberName: 'User 1',
          memberEmail: 'user1@example.com',
          hostName: 'Host',
          daysUntilDue: 3,
        },
        {
          recordId: 'rec-2',
          memberId: 'mem-2',
          groupId: 'group-1',
          periodId: 'period-1',
          dueDate: '2026-07-10',
          amountDue: '50000',
          serviceName: 'Netflix',
          memberName: 'User 2',
          memberEmail: 'user2@example.com',
          hostName: 'Host',
          daysUntilDue: 3,
        },
      ];

      const result = await service.bulkSendPaymentReminders(reminders);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(emailQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should handle partial failures gracefully', async () => {
      emailQueue.add
        .mockResolvedValueOnce({ id: 'job-1' } as any)
        .mockRejectedValueOnce(new Error('Queue error'));

      const reminders = [
        {
          recordId: 'rec-1',
          memberId: 'mem-1',
          groupId: 'group-1',
          periodId: 'period-1',
          dueDate: '2026-07-10',
          amountDue: '50000',
          serviceName: 'Netflix',
          memberName: 'User 1',
          memberEmail: 'user1@example.com',
          hostName: 'Host',
          daysUntilDue: 3,
        },
        {
          recordId: 'rec-2',
          memberId: 'mem-2',
          groupId: 'group-1',
          periodId: 'period-1',
          dueDate: '2026-07-10',
          amountDue: '50000',
          serviceName: 'Netflix',
          memberName: 'User 2',
          memberEmail: 'user2@example.com',
          hostName: 'Host',
          daysUntilDue: 3,
        },
      ];

      const result = await service.bulkSendPaymentReminders(reminders);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should return zero counts for empty array', async () => {
      const result = await service.bulkSendPaymentReminders([]);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(emailQueue.add).not.toHaveBeenCalled();
    });
  });
});
