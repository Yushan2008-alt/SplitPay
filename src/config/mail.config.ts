import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  resendApiKey: process.env.RESEND_API_KEY,
  from: process.env.MAIL_FROM ?? process.env.RESEND_FROM_EMAIL,
  fonnteToken: process.env.FONNTE_TOKEN,
}));
