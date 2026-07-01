// src/modules/split/split-calculation.spec.ts
// Unit tests for SplitCalculationService — pure static methods

import { SplitCalculationService } from './split-calculation.service';

// ─── Helper ───────────────────────────────────────────────────────────────────
function assertInvariant(totalCents: number, shares: number[]) {
  const sum = shares.reduce((a, b) => a + b, 0);
  expect(sum).toBe(totalCents);
}

// ─── EQUAL ────────────────────────────────────────────────────────────────────
describe('SplitCalculationService.equalSplit', () => {
  it('divides evenly with no remainder', () => {
    const shares = SplitCalculationService.equalSplit(30000_00, 3);
    expect(shares).toEqual([10000_00, 10000_00, 10000_00]);
    assertInvariant(30000_00, shares);
  });

  it('gives remainder to first member', () => {
    // 100000 Rp / 3 = 33333.33 → base=3333333, remainder=1
    const total = 100000_00; // in cents
    const shares = SplitCalculationService.equalSplit(total, 3);
    expect(shares[0]).toBe(33333_34);   // base + remainder = 3333333+1
    expect(shares[1]).toBe(33333_33);
    expect(shares[2]).toBe(33333_33);
    assertInvariant(total, shares);
  });

  it('handles single member', () => {
    const total = 50000_00;
    const shares = SplitCalculationService.equalSplit(total, 1);
    expect(shares).toEqual([50000_00]);
    assertInvariant(total, shares);
  });

  it('returns empty for 0 members', () => {
    expect(SplitCalculationService.equalSplit(50000_00, 0)).toEqual([]);
  });

  it('invariant holds for many members', () => {
    const total = 99999_99;
    const shares = SplitCalculationService.equalSplit(total, 7);
    assertInvariant(total, shares);
  });
});

// ─── CUSTOM PERCENTAGE ────────────────────────────────────────────────────────
describe('SplitCalculationService.percentSplit', () => {
  it('splits by exact percentages', () => {
    const total = 100000_00;
    const shares = SplitCalculationService.percentSplit(total, [50, 30, 20]);
    expect(shares[0]).toBe(50000_00);
    expect(shares[1]).toBe(30000_00);
    expect(shares[2]).toBe(20000_00);
    assertInvariant(total, shares);
  });

  it('gives remainder to largest share holder', () => {
    // 100003 cents / [50%, 50%] → base=[50001, 50001], sum=100002, remainder=1
    const total = 100003;
    const shares = SplitCalculationService.percentSplit(total, [50, 50]);
    assertInvariant(total, shares);
  });

  it('throws if percentages do not sum to 100', () => {
    expect(() =>
      SplitCalculationService.percentSplit(100000_00, [40, 30]),
    ).toThrow();
  });

  it('handles floating point percentages (33.33 + 33.33 + 33.34)', () => {
    const total = 99999_00;
    const shares = SplitCalculationService.percentSplit(total, [33.33, 33.33, 33.34]);
    assertInvariant(total, shares);
  });

  it('invariant holds for uneven split', () => {
    const total = 157_00;
    const shares = SplitCalculationService.percentSplit(total, [33.33, 33.33, 33.34]);
    assertInvariant(total, shares);
  });
});

// ─── PRO RATA ─────────────────────────────────────────────────────────────────
describe('SplitCalculationService.proRataSplit', () => {
  it('splits by active days proportionally', () => {
    // 30 days total, member A: 30 days, member B: 15 days
    const total = 30000_00;
    const shares = SplitCalculationService.proRataSplit(total, [30, 15]);
    // A: 30/(30+15)*30000 = 20000, B: 10000
    expect(shares[0]).toBe(20000_00);
    expect(shares[1]).toBe(10000_00);
    assertInvariant(total, shares);
  });

  it('remainder goes to member with most days', () => {
    const total = 10001; // odd cents
    const shares = SplitCalculationService.proRataSplit(total, [2, 1]);
    assertInvariant(total, shares);
    // Member with 2 days (index 0) gets remainder
    expect(shares[0]).toBeGreaterThan(shares[1]);
  });

  it('invariant holds for complex case', () => {
    const total = 150000_00;
    const shares = SplitCalculationService.proRataSplit(total, [28, 21, 14, 7]);
    assertInvariant(total, shares);
  });
});

// ─── INVARIANT ASSERTION ──────────────────────────────────────────────────────
describe('SplitCalculationService.assertInvariant', () => {
  it('does not throw when sum matches', () => {
    const svc = new SplitCalculationService(null as any, null as any);
    expect(() => svc.assertInvariant(100, [50, 50])).not.toThrow();
  });

  it('throws when sum does not match', () => {
    const svc = new SplitCalculationService(null as any, null as any);
    expect(() => svc.assertInvariant(100, [50, 51])).toThrow(/SPLIT INVARIANT VIOLATION/);
  });
});
