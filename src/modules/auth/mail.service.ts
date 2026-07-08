import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string | null;
  private readonly from: string;
  private readonly apiUrl = 'https://api.resend.com/emails';

  constructor(config: ConfigService) {
    // ponytail: Resend HTTP API over SMTP — DO blocks outbound SMTP ports
    this.apiKey = config.get<string>('RESEND_API_KEY') ?? null;
    this.from =
      config.get<string>('MAIL_FROM') ?? 'noreply@splitpay.id';

    if (!this.apiKey) {
      this.logger.log('[DEV] No RESEND_API_KEY — OTP emails will be logged only');
    }
  }

  // ponytail: mask PII in logs — show first char + domain only
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
  }

  async sendOtpEmail(email: string, otp: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(
        `[DEV] No RESEND_API_KEY — skipping email to ${this.maskEmail(email)}`,
      );
      return;
    }

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: email,
          subject: 'Kode OTP SplitPay Anda',
          html: this.buildOtpEmail(otp),
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `Resend API error [${res.status}] for ${this.maskEmail(email)}: ${body}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Email error for ${this.maskEmail(email)}: ${(err as Error).message}`,
      );
      /* ponytail: email failure is non-fatal — OTP is stored in DB and
         printed to console in dev. In production, add a retry queue if
         delivery reliability is required. */
    }
  }

  private buildOtpEmail(otp: string): string {
    return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
<h2>Kode OTP SplitPay</h2>
<p>Gunakan kode berikut untuk melanjutkan proses verifikasi:</p>
<div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:16px;background:#f3f4f6;border-radius:8px;margin:16px 0">${otp}</div>
<p>Kode berlaku selama 5 menit. Jangan bagikan kode ini kepada siapa pun.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
<p style="color:#6b7280;font-size:12px">Jika Anda tidak meminta kode ini, abaikan email ini.</p>
</div>`;
  }
}
