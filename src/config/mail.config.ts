import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  sendgridApiKey: process.env.SENDGRID_API_KEY,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  from: process.env.MAIL_FROM,
  fonnteToken: process.env.FONNTE_TOKEN,
}));
