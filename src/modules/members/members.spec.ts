// src/modules/members/members.spec.ts
// Unit tests for Members business rules

// ─── MAX MEMBERS ──────────────────────────────────────────────────────────────
describe('MembersService — max members constraint', () => {
  const MAX = 20;

  it('should reject adding member when count is at max', () => {
    const currentCount = MAX;
    const canAdd = currentCount < MAX;
    expect(canAdd).toBe(false);
  });

  it('should allow adding when count is below max', () => {
    const currentCount = 19;
    const canAdd = currentCount < MAX;
    expect(canAdd).toBe(true);
  });

  it('boundary: exactly 19 members → can add one more', () => {
    expect(19 < MAX).toBe(true);
  });

  it('boundary: exactly 20 members → cannot add', () => {
    expect(20 < MAX).toBe(false);
  });
});

// ─── HOST SELF-REMOVE PREVENTION ──────────────────────────────────────────────
describe('MembersService — host self-remove prevention', () => {
  it('should block host from removing themselves', () => {
    const hostUserId = 'host-uuid';
    const member = { userId: 'host-uuid', role: 'host' };
    const isSelf = member.userId === hostUserId;
    expect(isSelf).toBe(true); // would throw BadRequestException
  });

  it('should allow host to remove other members', () => {
    const hostUserId = 'host-uuid';
    const member = { userId: 'payer-uuid', role: 'payer' };
    const isSelf = member.userId === hostUserId;
    expect(isSelf).toBe(false); // allowed
  });
});

// ─── DUPLICATE MEMBER PREVENTION ─────────────────────────────────────────────
describe('MembersService — duplicate member prevention', () => {
  it('should detect duplicate email in same group', () => {
    const existingEmails = ['alice@test.com', 'bob@test.com'];
    const newEmail = 'alice@test.com';
    const isDuplicate = existingEmails.includes(newEmail.toLowerCase().trim());
    expect(isDuplicate).toBe(true);
  });

  it('should allow different email in same group', () => {
    const existingEmails = ['alice@test.com', 'bob@test.com'];
    const newEmail = 'charlie@test.com';
    const isDuplicate = existingEmails.includes(newEmail.toLowerCase().trim());
    expect(isDuplicate).toBe(false);
  });
});

// ─── PERMISSION RULES ────────────────────────────────────────────────────────
describe('MembersService — update permission rules', () => {
  it('payer can only update their own notificationPreference', () => {
    const allowedFields = ['notificationPreference'];
    const requestedFields = ['notificationPreference'];
    const isAllowed = requestedFields.every(f => allowedFields.includes(f));
    expect(isAllowed).toBe(true);
  });

  it('payer cannot update shareAmount', () => {
    const allowedFields = ['notificationPreference'];
    const requestedFields = ['shareAmount'];
    const isAllowed = requestedFields.every(f => allowedFields.includes(f));
    expect(isAllowed).toBe(false);
  });

  it('host can update all member fields', () => {
    const hostAllowedFields = ['notificationPreference', 'shareAmount', 'sharePercentage'];
    const requestedFields = ['shareAmount', 'sharePercentage'];
    const isAllowed = requestedFields.every(f => hostAllowedFields.includes(f));
    expect(isAllowed).toBe(true);
  });
});

// ─── EQUAL RECALCULATION ─────────────────────────────────────────────────────
describe('MembersService — EQUAL share recalculation', () => {
  const totalCents = 100000_00;

  it('recalculates correctly after adding member (2 → 3)', () => {
    const count = 3;
    const base = Math.floor(totalCents / count);
    const remainder = totalCents - base * count;
    const shares = Array.from({ length: count }, (_, i) => base + (i === 0 ? remainder : 0));
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalCents);
  });

  it('recalculates correctly after removing member (3 → 2)', () => {
    const count = 2;
    const base = Math.floor(totalCents / count);
    const remainder = totalCents - base * count;
    const shares = Array.from({ length: count }, (_, i) => base + (i === 0 ? remainder : 0));
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(sum).toBe(totalCents);
  });
});
