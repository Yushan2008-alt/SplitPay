// Queue definitions untuk notification system
// Defines job types, data interfaces, and default options

import type { JobsOptions } from 'bullmq';

// ─── QUEUE NAMES ──────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  EMAIL: 'notification-email',
  PUSH: 'notification-push',
  WHATSAPP: 'notification-whatsapp',
} as const;

// ─── JOB TYPES ────────────────────────────────────────────────────────────

export enum NotificationJobType {
  PAYMENT_REMINDER = 'payment_reminder',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  OVERDUE_ALERT = 'overdue_alert',
  GRACE_EXPIRING = 'grace_expiring',
}

// ─── JOB DATA INTERFACES ──────────────────────────────────────────────────

export interface PaymentReminderJob {
  type: NotificationJobType.PAYMENT_REMINDER;
  recordId: string;
  memberId: string;
  groupId: string;
  periodId: string;
  dueDate: string; // YYYY-MM-DD
  amountDue: string; // Rupiah as string
  serviceName: string;
  memberName: string;
  memberEmail: string;
  memberPhone?: string; // For WhatsApp
  hostName: string;
  daysUntilDue: number; // For urgency text (3, 1, 0)
}

export interface PaymentConfirmedJob {
  type: NotificationJobType.PAYMENT_CONFIRMED;
  recordId: string;
  memberId: string;
  groupId: string;
  periodId: string;
  amountPaid: string;
  serviceName: string;
  memberName: string;
  hostEmail: string;
  hostPhone?: string; // For WhatsApp
  hostName: string;
  confirmedAt: string; // ISO timestamp
}

export interface OverdueAlertJob {
  type: NotificationJobType.OVERDUE_ALERT;
  recordId: string;
  memberId: string;
  groupId: string;
  periodId: string;
  amountDue: string;
  serviceName: string;
  memberName: string;
  memberEmail: string;
  memberPhone?: string; // For WhatsApp
  hostName: string;
  dueDate: string;
  daysOverdue: number;
}

export interface GraceExpiringJob {
  type: NotificationJobType.GRACE_EXPIRING;
  recordId: string;
  memberId: string;
  groupId: string;
  periodId: string;
  amountDue: string;
  serviceName: string;
  memberName: string;
  memberEmail: string;
  hostName: string;
  graceEndDate: string;
  daysRemaining: number;
}

// Union type untuk all job data
export type NotificationJobData =
  | PaymentReminderJob
  | PaymentConfirmedJob
  | OverdueAlertJob
  | GraceExpiringJob;

// ─── DEFAULT JOB OPTIONS ──────────────────────────────────────────────────

/**
 * Default options untuk notification jobs.
 * - attempts: 3-5 retries depending on job type
 * - backoff: exponential (2^attempt * 1000ms)
 * - removeOnComplete: keep last 100 completed jobs
 * - removeOnFail: keep last 500 failed jobs for debugging
 */
export const DEFAULT_JOB_OPTIONS: Record<
  NotificationJobType,
  JobsOptions
> = {
  [NotificationJobType.PAYMENT_REMINDER]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  [NotificationJobType.PAYMENT_CONFIRMED]: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  [NotificationJobType.OVERDUE_ALERT]: {
    attempts: 5, // Higher attempts for critical alerts
    backoff: {
      type: 'exponential',
      delay: 2000, // Longer backoff for overdue alerts
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  [NotificationJobType.GRACE_EXPIRING]: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
};
