import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

/**
 * Push notification payload interface.
 * Follows Web Push Notification standard.
 */
export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    type?: string;
    [key: string]: unknown;
  };
  actions?: Array<{
    action: string;
    title: string;
  }>;
}

/**
 * Push subscription format (from browser Push API).
 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * VAPIDProvider
 * 
 * Manages Web Push notifications via VAPID protocol.
 * Initializes web-push library with VAPID keys on module init.
 */
@Injectable()
export class VAPIDProvider implements OnModuleInit {
  private readonly logger = new Logger(VAPIDProvider.name);
  private isConfigured = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@splitpay.id';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys not configured — push notifications will be logged but not sent',
      );
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.isConfigured = true;
      this.logger.log('VAPID push notifications configured successfully');
    } catch (error) {
      this.logger.error(
        `Failed to configure VAPID: ${(error as Error).message}`,
        error,
      );
    }
  }

  /**
   * Send push notification to a single subscription.
   * 
   * @param subscription - Push subscription from browser
   * @param payload - Notification content
   * @returns Success/failure status with error details
   * 
   * Status codes:
   * - 410 Gone: Subscription expired (should be removed from DB)
   * - 404 Not Found: Subscription invalid (should be removed from DB)
   * - 201 Created: Success
   */
  async sendPush(
    subscription: PushSubscription,
    payload: PushPayload,
  ): Promise<{
    success: boolean;
    statusCode?: number;
    error?: string;
    shouldRemove?: boolean; // True for 410/404
  }> {
    if (!this.isConfigured) {
      this.logger.log(
        `[DEV MODE] Push to ${subscription.endpoint.slice(-20)}: ${payload.title}`,
      );
      return { success: true, statusCode: 201 };
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    };

    const options = {
      TTL: 86400, // 24 hours
    };

    try {
      const response = await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        options,
      );

      this.logger.log(
        `Push sent successfully to ${subscription.endpoint.slice(-20)}: ${response.statusCode}`,
      );

      return { success: true, statusCode: response.statusCode };
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const errorMessage = error.body || error.message;

      // ponytail: 410 Gone or 404 Not Found = subscription invalid, should be removed
      if (statusCode === 410 || statusCode === 404) {
        this.logger.warn(
          `Stale push subscription (${statusCode}): ${subscription.endpoint.slice(-20)}`,
        );
        return {
          success: false,
          statusCode,
          error: 'Subscription expired or invalid',
          shouldRemove: true,
        };
      }

      // Other errors: log but don't remove subscription (might be temporary)
      this.logger.error(
        `Push send failed (${statusCode}): ${errorMessage}`,
        error,
      );

      return {
        success: false,
        statusCode,
        error: errorMessage,
        shouldRemove: false,
      };
    }
  }

  /**
   * Check if VAPID is properly configured.
   */
  getConfigured(): boolean {
    return this.isConfigured;
  }
}
