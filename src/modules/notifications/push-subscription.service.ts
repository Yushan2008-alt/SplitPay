import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PushSubscriptionRepository } from '../../database/repositories/push-subscription.repository.js';
import { ErrorCode } from '../../common/constants/error-codes.js';
import type { PushSubscriptionEntity } from '../../database/entities/index.js';

export interface SubscribePushDto {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

@Injectable()
export class PushSubscriptionService {
  constructor(
    private readonly pushSubRepo: PushSubscriptionRepository,
  ) {}

  /**
   * Subscribe user to push notifications.
   * Upserts by endpoint (if exists, update keys).
   */
  async subscribe(
    userId: string,
    dto: SubscribePushDto,
  ): Promise<PushSubscriptionEntity> {
    // Check if subscription already exists by endpoint
    const existing = await this.pushSubRepo.findByEndpoint(dto.endpoint);

    if (existing) {
      // Update existing subscription keys (browser may have rotated them)
      return this.pushSubRepo.update(existing.id, {
        p256dh: dto.p256dh,
        auth: dto.auth,
        userAgent: dto.userAgent ?? null,
        userId, // Ensure ownership updated
      });
    }

    // Create new subscription
    return this.pushSubRepo.createEntity({
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.p256dh,
      auth: dto.auth,
      userAgent: dto.userAgent ?? null,
    });
  }

  /**
   * Unsubscribe from push notifications.
   * Verifies ownership before deletion.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    const subscription = await this.pushSubRepo.findByEndpoint(endpoint);

    if (!subscription) {
      throw new NotFoundException({
        code: ErrorCode.PUSH_SUBSCRIPTION_NOT_FOUND,
        message: 'Push subscription tidak ditemukan',
      });
    }

    // Verify ownership
    if (subscription.userId !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Anda tidak memiliki akses ke subscription ini',
      });
    }

    await this.pushSubRepo.hardDelete(subscription.id);
  }

  /**
   * Get all push subscriptions for a user.
   */
  async getUserSubscriptions(
    userId: string,
  ): Promise<PushSubscriptionEntity[]> {
    return this.pushSubRepo.findByUserId(userId);
  }

  /**
   * Remove all subscriptions for a user.
   */
  async removeAllUserSubscriptions(userId: string): Promise<void> {
    await this.pushSubRepo.deleteByUserId(userId);
  }
}
