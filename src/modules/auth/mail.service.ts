import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');

    if (!host) {
      this.logger.log('[DEV] No SMTP config — OTP emails will be logged only');
      this.transporter = null;
    } else {
      const port = config.get<number>('SMTP_PORT') ?? 587;
      const user = config.get<string>('SMTP_USER');
      const pass = config.get<string>('SMTP_PASS');

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
      });
    }

    this.from =
      config.get<string>('MAIL_FROM') ?? 'noreply@splitpay.id';
  }

  // ponytail: mask PII in logs — show first char + domain only
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
  }

  async sendOtpEmail(email: string, otp: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[DEV] No SMTP config — skipping email to ${this.maskEmail(email)}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Kode OTP SplitPay Anda',
        html: this.buildOtpEmail(otp),
      });
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
