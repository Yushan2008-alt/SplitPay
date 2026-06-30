process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.DATABASE_URL =
  'postgresql://postgres:postgyus28@localhost:5432/splitpay_dev';
process.env.REDIS_URL = 'redis://default:redis_secret@localhost:6379';
process.env.JWT_ACCESS_SECRET =
  '1111111111111111111111111111111111111111111111111111111111111111';
process.env.JWT_REFRESH_SECRET =
  '2222222222222222222222222222222222222222222222222222222222222222';
process.env.SIGNED_URL_SECRET =
  '3333333333333333333333333333333333333333333333333333333333333333';
process.env.PAYMENT_WEBHOOK_SECRET = '44444444444444444444444444444444';
process.env.RESEND_FROM_EMAIL = 'noreply@example.com';
process.env.MAIL_FROM = 'noreply@example.com';
