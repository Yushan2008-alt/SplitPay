// src/database/entities/enums.ts
// All domain enums for SplitPay database entities
// Values are lowercase strings matching PostgreSQL CHECK constraints

export enum SplitMethod {
  EQUAL = 'equal',
  CUSTOM_PERCENTAGE = 'custom_percentage',
  CUSTOM_NOMINAL = 'custom_nominal',
  PRO_RATA = 'pro_rata',
}

export enum BillingFrequency {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  WEEKLY = 'weekly',
}

export enum GroupStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

export enum MemberRole {
  HOST = 'host',
  PAYER = 'payer',
}

export enum MemberStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  REMOVED = 'removed',
}

export enum NotificationPreference {
  EMAIL = 'email',
  PUSH = 'push',
  BOTH = 'both',
  NONE = 'none',
}

export enum PeriodStatus {
  UPCOMING = 'upcoming',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  WAIVED = 'waived',
}

export enum NotificationType {
  REMINDER_3D = 'reminder_3d', // 3 hari sebelum jatuh tempo
  REMINDER_1D = 'reminder_1d', // 1 hari sebelum
  REMINDER_0D = 'reminder_0d', // Hari H
  PAYMENT_CONFIRMED = 'payment_confirmed', // Konfirmasi ke host
  OVERDUE_ALERT = 'overdue_alert', // Setelah grace period lewat
}

export enum NotificationChannel {
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}
