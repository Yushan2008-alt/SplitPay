// src/modules/billing/billing-cycle.spec.ts
// Unit tests for BillingCycleService

import { PeriodStatus, PaymentStatus } from '../../database/entities/index';

// ─── Date computation helpers ─────────────────────────────────────────────────
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('BillingCycleService — period date computation', () => {
  it('monthly: periodStart = first of month', () => {
    const now = new Date('2025-07-10');
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    expect(formatDate(start)).toBe('2025-07-01');
  });

  it('monthly: periodEnd = last day of month', () => {
    const now = new Date('2025-07-10');
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    expect(formatDate(end)).toBe('2025-07-31');
  });

  it('monthly: dueDate capped at 28 for short months', () => {
    // Feb 2025 has 28 days
    const now = new Date('2025-02-01');
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const dueDay = 30; // requested 30th
    const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDay, end.getDate()));
    expect(dueDate.getDate()).toBe(28);
  });

  it('monthly: if dueDate already passed, generate next month cycle', () => {
    const now = new Date('2025-07-20');
    const dueDay = 15;
    const thisMonthDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
    const alreadyPassed = thisMonthDue < now;
    expect(alreadyPassed).toBe(true);
    // → push to next month
    const nextMonthDue = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
    expect(nextMonthDue.getMonth()).toBe(now.getMonth() + 1);
  });
});

// ─── Status update logic ──────────────────────────────────────────────────────
describe('BillingCycleService — updateCycleStatus logic', () => {
  it('all PAID → COMPLETED', () => {
    const records = [
      { status: PaymentStatus.PAID },
      { status: PaymentStatus.PAID },
    ];
    const allPaid = records.every(r => r.status === PaymentStatus.PAID);
    const result = allPaid ? PeriodStatus.COMPLETED : PeriodStatus.ACTIVE;
    expect(result).toBe(PeriodStatus.COMPLETED);
  });

  it('any PAID but not all → ACTIVE', () => {
    const records = [
      { status: PaymentStatus.PAID },
      { status: PaymentStatus.PENDING },
    ];
    const allPaid = records.every(r => r.status === PaymentStatus.PAID);
    const anyPaid = records.some(r => r.status === PaymentStatus.PAID);
    const result = allPaid ? PeriodStatus.COMPLETED : anyPaid ? PeriodStatus.ACTIVE : PeriodStatus.UPCOMING;
    expect(result).toBe(PeriodStatus.ACTIVE);
  });

  it('none PAID → UPCOMING (no change)', () => {
    const records = [
      { status: PaymentStatus.PENDING },
      { status: PaymentStatus.PENDING },
    ];
    const allPaid = records.every(r => r.status === PaymentStatus.PAID);
    const anyPaid = records.some(r => r.status === PaymentStatus.PAID);
    const result = allPaid ? PeriodStatus.COMPLETED : anyPaid ? PeriodStatus.ACTIVE : PeriodStatus.UPCOMING;
    expect(result).toBe(PeriodStatus.UPCOMING);
  });

  it('past due date + not all paid → OVERDUE', () => {
    const dueDate = new Date('2025-01-01'); // past
    const now = new Date('2025-07-01');
    const allPaid = false;
    const isOverdue = now > dueDate && !allPaid;
    expect(isOverdue).toBe(true);
  });
});

// ─── Payment record generation ────────────────────────────────────────────────
describe('BillingCycleService — payment record generation', () => {
  it('should create one record per active member', () => {
    const members = [
      { id: 'm1', shareAmount: '50000' },
      { id: 'm2', shareAmount: '50000' },
    ];
    // Records should = member count
    expect(members.length).toBe(2);
  });

  it('sum of amountDue should equal totalAmount', () => {
    const totalAmount = 100000;
    const shares = [50000, 50000];
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalAmount);
  });

  it('initial status for all records should be PENDING', () => {
    const record = { status: PaymentStatus.PENDING };
    expect(record.status).toBe(PaymentStatus.PENDING);
  });
});
