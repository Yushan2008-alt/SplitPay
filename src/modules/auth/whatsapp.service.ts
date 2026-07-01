import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly token: string | null;

  constructor(config: ConfigService) {
    this.token = config.get<string>('mail.fonnteToken') ?? null;
  }

  async sendOtpWhatsApp(phone: string, otp: string): Promise<void> {
    if (!this.token) {
      this.logger.log(
        `[DEV] No Fonnte token — skipping WhatsApp OTP to ${phone}`,
      );
      return;
    }

    this.logger.log(
      `[DEV] WhatsApp OTP would be sent to ${phone}: ${otp} (Fonnte integration pending)`,
    );
  }
}
