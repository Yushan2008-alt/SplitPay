import Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3001),
  FRONTEND_URL: Joi.string().required(),
  APP_BASE_URL: Joi.string().uri().default('http://localhost:3001'),

  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(64).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(64).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  OTP_EXPIRES_IN_SECONDS: Joi.number().integer().positive().default(300),
  OTP_MAX_ATTEMPTS: Joi.number().integer().positive().default(5),
  OTP_COOLDOWN_SECONDS: Joi.number().integer().positive().default(60),

  SIGNED_URL_SECRET: Joi.string().min(64).required(),
  SIGNED_URL_EXPIRES_IN_HOURS: Joi.number().integer().positive().default(72),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  SENDGRID_API_KEY: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string().email().optional(),
  FONNTE_TOKEN: Joi.string().allow('').optional(),

  VAPID_PUBLIC_KEY: Joi.string().allow('').optional(),
  VAPID_PRIVATE_KEY: Joi.string().allow('').optional(),
  VAPID_SUBJECT: Joi.string().allow('').optional(),

  PAYMENT_WEBHOOK_SECRET: Joi.string().min(32).required(),
  DEFAULT_PAYMENT_PROVIDER: Joi.string()
    .valid('MIDTRANS', 'XENDIT')
    .default('MIDTRANS'),
  MIDTRANS_SERVER_KEY: Joi.string().allow('').optional(),
  MIDTRANS_CLIENT_KEY: Joi.string().allow('').optional(),
  MIDTRANS_IS_PRODUCTION: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  XENDIT_SECRET_KEY: Joi.string().allow('').optional(),
  XENDIT_WEBHOOK_TOKEN: Joi.string().allow('').optional(),

  THROTTLE_TTL: Joi.number().integer().positive().default(60),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(60),
  TZ: Joi.string().default('Asia/Jakarta'),
});
