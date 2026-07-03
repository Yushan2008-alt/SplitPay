import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

/**
 * FonnteProvider
 * 
 * Sends WhatsApp messages via Fonnte API.
 * Handles phone normalization and API communication.
 */
@Injectable()
export class FonnteProvider {
  private readonly logger = new Logger(FonnteProvider.name);
  private readonly token: string | null;
  private readonly apiUrl = 'https://api.fonnte.com/send';
  private readonly timeout = 5000; // 5 seconds

  constructor(config: ConfigService) {
    this.token = config.get<string>('FONNTE_TOKEN') ?? null;

    if (!this.token) {
      this.logger.warn(
        'FONNTE_TOKEN not configured — WhatsApp messages will be logged but not sent',
      );
    }
  }

  /**
   * Send WhatsApp message via Fonnte API.
   * 
   * @param phone - Phone number (will be normalized)
   * @param message - Plain text message content
   * @returns Success/failure status
   */
  // ponytail: mask PII in logs — show prefix + last 4 digits only
  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return `${phone.slice(0, 2)}xx****${phone.slice(-4)}`;
  }

  async sendWhatsApp(
    phone: string,
    message: string,
  ): Promise<{ success: boolean; error?: string; messageId?: string }> {
    // Graceful degradation: log if no token
    if (!this.token) {
      this.logger.log(
        `[DEV MODE] WhatsApp to ${this.maskPhone(phone)}: [Message content not logged for privacy]`,
      );
      return { success: true, messageId: 'dev-mode-no-send' };
    }

    // Normalize phone number for Indonesia
    const normalizedPhone = this.normalizePhone(phone);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          target: normalizedPhone,
          message: message,
          countryCode: '62', // Indonesia
        },
        {
          headers: {
            Authorization: this.token,
          },
          timeout: this.timeout,
        },
      );

      // ponytail: JANGAN log message content atau full phone untuk privacy
      this.logger.log(
        `WhatsApp sent successfully to ${this.maskPhone(normalizedPhone)}: ${response.data.status || 'OK'}`,
      );

      return {
        success: true,
        messageId: response.data.id || response.data.message_id,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      const errorMessage = axiosError.response?.data
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message;

      // ponytail: Log error but NOT message content or full phone
      this.logger.error(
        `WhatsApp send failed to ${this.maskPhone(normalizedPhone)}: ${errorMessage}`,
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Normalize phone number for Fonnte API.
   * 
   * Rules:
   * - Remove leading 0 (Indonesian local format)
   * - Remove leading + (international format)
   * - Add 62 prefix if not present
   * 
   * Examples:
   * - 081234567890 → 6281234567890
   * - +6281234567890 → 6281234567890
   * - 6281234567890 → 6281234567890
   */
  private normalizePhone(phone: string): string {
    let normalized = phone.trim().replace(/\s/g, ''); // Remove spaces

    // Remove leading +
    if (normalized.startsWith('+')) {
      normalized = normalized.slice(1);
    }

    // Replace leading 0 with 62 (Indonesian local → international)
    if (normalized.startsWith('0')) {
      normalized = '62' + normalized.slice(1);
    }

    // Ensure 62 prefix
    if (!normalized.startsWith('62')) {
      normalized = '62' + normalized;
    }

    return normalized;
  }

  /**
   * Check if Fonnte is properly configured.
   */
  isConfigured(): boolean {
    return this.token !== null;
  }
}
