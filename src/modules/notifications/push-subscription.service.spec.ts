import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PushSubscriptionService } from './push-subscription.service';
import { PushSubscriptionRepository } from '../../database/repositories/push-subscription.repository';
import type { PushSubscriptionEntity } from '../../database/entities';

describe('PushSubscriptionService', () => {
  let service: PushSubscriptionService;
  let repository: jest.Mocked<PushSubscriptionRepository>;

  const mockSubscription: Partial<PushSubscriptionEntity> = {
    id: 'sub-123',
    userId: 'user-123',
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-123',
    p256dh: 'test-p256dh-key',
    auth: 'test-auth-key',
    userAgent: 'Mozilla/5.0...',
  };

  beforeEach(async () => {
    const mockRepository = {
      findByEndpoint: jest.fn(),
      update: jest.fn(),
      createEntity: jest.fn(),
      findByUserId: jest.fn(),
      hardDelete: jest.fn(),
      deleteByUserId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushSubscriptionService,
        { provide: PushSubscriptionRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<PushSubscriptionService>(PushSubscriptionService);
    repository = module.get(PushSubscriptionRepository);
  });

  describe('subscribe', () => {
    const subscribeDto = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-123',
      p256dh: 'test-p256dh-key',
      auth: 'test-auth-key',
      userAgent: 'Mozilla/5.0...',
    };

    it('should create new subscription if not exists', async () => {
      repository.findByEndpoint.mockResolvedValue(null);
      repository.createEntity.mockResolvedValue(mockSubscription as any);

      const result = await service.subscribe('user-123', subscribeDto);

      expect(repository.findByEndpoint).toHaveBeenCalledWith(subscribeDto.endpoint);
      expect(repository.createEntity).toHaveBeenCalledWith({
        userId: 'user-123',
        endpoint: subscribeDto.endpoint,
        p256dh: subscribeDto.p256dh,
        auth: subscribeDto.auth,
        userAgent: subscribeDto.userAgent,
      });
      expect(result).toEqual(mockSubscription);
    });

    it('should update existing subscription (upsert)', async () => {
      repository.findByEndpoint.mockResolvedValue(mockSubscription as any);
      repository.update.mockResolvedValue({ ...mockSubscription, p256dh: 'new-key' } as any);

      const result = await service.subscribe('user-123', {
        ...subscribeDto,
        p256dh: 'new-key',
      });

      expect(repository.findByEndpoint).toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith('sub-123', {
        p256dh: 'new-key',
        auth: subscribeDto.auth,
        userAgent: subscribeDto.userAgent,
        userId: 'user-123',
      });
      expect(result.p256dh).toBe('new-key');
    });

    it('should handle upsert by endpoint (browser may rotate keys)', async () => {
      const existingWithOldKeys = { ...mockSubscription, p256dh: 'old-key' };
      repository.findByEndpoint.mockResolvedValue(existingWithOldKeys as any);
      repository.update.mockResolvedValue({ ...mockSubscription, p256dh: 'rotated-key' } as any);

      await service.subscribe('user-123', {
        ...subscribeDto,
        p256dh: 'rotated-key',
      });

      expect(repository.update).toHaveBeenCalledWith(
        'sub-123',
        expect.objectContaining({
          p256dh: 'rotated-key',
        }),
      );
    });
  });

  describe('unsubscribe', () => {
    it('should throw NotFoundException if subscription not found', async () => {
      repository.findByEndpoint.mockResolvedValue(null);

      await expect(
        service.unsubscribe('user-123', 'https://fcm.googleapis.com/...'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not owner', async () => {
      repository.findByEndpoint.mockResolvedValue(mockSubscription as any);

      await expect(
        service.unsubscribe('other-user', mockSubscription.endpoint!),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete subscription if owner', async () => {
      repository.findByEndpoint.mockResolvedValue(mockSubscription as any);

      await service.unsubscribe('user-123', mockSubscription.endpoint!);

      expect(repository.hardDelete).toHaveBeenCalledWith('sub-123');
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return all user subscriptions', async () => {
      const subscriptions = [
        { ...mockSubscription, id: 'sub-1' },
        { ...mockSubscription, id: 'sub-2' },
      ];
      repository.findByUserId.mockResolvedValue(subscriptions as any);

      const result = await service.getUserSubscriptions('user-123');

      expect(repository.findByUserId).toHaveBeenCalledWith('user-123');
      expect(result).toHaveLength(2);
    });

    it('should return empty array if no subscriptions', async () => {
      repository.findByUserId.mockResolvedValue([]);

      const result = await service.getUserSubscriptions('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('removeAllUserSubscriptions', () => {
    it('should delete all user subscriptions', async () => {
      await service.removeAllUserSubscriptions('user-123');

      expect(repository.deleteByUserId).toHaveBeenCalledWith('user-123');
    });
  });
});
