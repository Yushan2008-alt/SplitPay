import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSignedToken } from '../../common/utils/crypto.util.js';

/**
 * SignedUrlService
 * 
 * Helper untuk generate signed URLs untuk payment confirmation.
 * Digunakan oleh notification service saat mengirim email reminder.
 */
@Injectable()
export class SignedUrlService {
  private readonly secret: string;
  private readonly expiresInHours: number;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.getOrThrow<string>('SIGNED_URL_SECRET');
    this.expiresInHours =
      this.config.get<number>('SIGNED_URL_EXPIRES_IN_HOURS') ?? 72;
    this.baseUrl =
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3001';
  }

  /**
   * Generate signed URL untuk payment confirmation.
   * 
   * @param recordId - Payment record ID
   * @returns Full URL yang bisa diklik di email
   * 
   * @example
   * const url = signedUrlService.generatePaymentConfirmUrl('record-123')
   * // Returns: http://api.splitpay.id/api/v1/payments/confirm?token=eyJ...
   */
  generatePaymentConfirmUrl(recordId: string): string {
    const token = generateSignedToken(
      { recordId },
      this.secret,
      this.expiresInHours * 60 * 60, // convert to seconds
    );

    return `${this.baseUrl}/api/v1/payments/confirm?token=${encodeURIComponent(token)}`;
  }

  /**
   * Generate raw token (tanpa URL) untuk testing atau custom handling.
   */
  generatePaymentConfirmToken(recordId: string): string {
    return generateSignedToken(
      { recordId },
      this.secret,
      this.expiresInHours * 60 * 60,
    );
  }
}
