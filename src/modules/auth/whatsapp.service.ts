import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly token: string | null;

  constructor(config: ConfigService) {
    this.token = config.get<string>('mail.fonnteToken') ?? null;
  }

  // ponytail: mask PII in logs — show prefix + last 4 digits only
  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return `08xx****${phone.slice(-4)}`;
  }

  async sendOtpWhatsApp(phone: string, otp: string): Promise<void> {
    if (!this.token) {
      this.logger.log(
        `[DEV] No Fonnte token — skipping WhatsApp OTP to ${this.maskPhone(phone)}`,
      );
      return;
    }

    this.logger.log(
      `[DEV] WhatsApp OTP would be sent to ${this.maskPhone(phone)} (Fonnte integration pending)`,
    );
  }
}
