import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NodemailerProvider {
  private readonly logger = new Logger(NodemailerProvider.name);
  private readonly apiKey: string | null;
  private readonly from: string;
  private readonly apiUrl = 'https://api.resend.com/emails';

  constructor(config: ConfigService) {
    // ponytail: Resend HTTP API — DO blocks outbound SMTP ports
    this.apiKey = config.get<string>('RESEND_API_KEY') ?? null;
    this.from =
      config.get<string>('MAIL_FROM') ??
      config.get<string>('RESEND_FROM_EMAIL') ??
      'noreply@splitpay.id';

    if (!this.apiKey) {
      this.logger.warn(
        'RESEND_API_KEY not configured — emails will be logged but not sent',
      );
    }
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

    if (!this.apiKey) {
      this.logger.log(
        `[DEV MODE] Email to ${this.maskEmail(to)}: ${subject}\n(Set RESEND_API_KEY to actually send)`,
      );
      return { success: true, messageId: 'dev-mode-no-send' };
    }

    try {
      const res = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to, subject, html }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(`Resend API error [${res.status}]: ${body}`);
        return { success: false, error: `Resend API error ${res.status}: ${body}` };
      }

      const data = await res.json().catch(() => ({} as any));
      this.logger.log(`Email sent successfully to ${this.maskEmail(to)}: ${data.id ?? 'ok'}`);
      return { success: true, messageId: data.id };
    } catch (err) {
      const errorMessage = (err as Error).message;
      this.logger.error(`Email send failed for ${this.maskEmail(to)}: ${errorMessage}`, err);
      return { success: false, error: errorMessage };
    }
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }
}
