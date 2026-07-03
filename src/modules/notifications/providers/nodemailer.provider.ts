import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class NodemailerProvider {
  private readonly logger = new Logger(NodemailerProvider.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');

    if (!host) {
      this.logger.warn(
        'SMTP_HOST not configured — emails will be logged but not sent',
      );
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
      });
    }

    this.from =
      config.get<string>('MAIL_FROM') ??
      config.get<string>('RESEND_FROM_EMAIL') ??
      'noreply@splitpay.id';
  }

  // ponytail: mask PII in logs — show first char + domain only
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { to, subject, html } = params;

    if (!this.transporter) {
      this.logger.log(
        `[DEV MODE] Email to ${this.maskEmail(to)}: ${subject}\n(Set SMTP_HOST/SMTP_USER/SMTP_PASS to actually send)`,
      );
      return { success: true, messageId: 'dev-mode-no-send' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent successfully to ${this.maskEmail(to)}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      const errorMessage = (err as Error).message;
      this.logger.error(`Email send failed for ${this.maskEmail(to)}: ${errorMessage}`, err);
      return { success: false, error: errorMessage };
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }
}
