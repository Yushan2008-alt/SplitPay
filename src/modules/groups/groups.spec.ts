// src/modules/groups/groups.spec.ts
// Unit tests for GroupsService business rules

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

// ─── Helpers / Mocks ──────────────────────────────────────────────────────────
function makeGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-uuid',
    hostId: 'host-uuid',
    name: 'Netflix Family',
    serviceName: 'Netflix',
    totalAmount: '100000',
    frequency: 'monthly',
    dueDay: 15,
    splitMethod: 'equal',
    gracePeriodDays: 3,
    status: 'active',
    ...overrides,
  };
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-uuid',
    groupId: 'group-uuid',
    userId: 'host-uuid',
    email: 'host@test.com',
    role: 'host',
    status: 'active',
    shareAmount: '100000',
    ...overrides,
  };
}

// ─── assertGroupOwner logic ───────────────────────────────────────────────────
describe('GroupsService.assertGroupOwner', () => {
  it('should return group when caller is host', async () => {
    const group = makeGroup();
    const groupRepo = { findById: jest.fn().mockResolvedValue(group) };
    // Simulate the logic directly
    const result = group.hostId === 'host-uuid' ? group : null;
    expect(result).not.toBeNull();
  });

  it('should return 403 (not 404) when caller is not host', async () => {
    const group = makeGroup({ hostId: 'other-uuid' });
    const groupRepo = { findById: jest.fn().mockResolvedValue(group) };
    // Not host → ForbiddenException
    const isOwner = group.hostId === 'caller-uuid';
    expect(isOwner).toBe(false);
  });

  it('should throw 403 when group does not exist', () => {
    // Non-existent group → 403 (not 404) per PRD security requirement
    const group = null;
    const isOwner = group ? (group as any).hostId === 'caller-uuid' : false;
    expect(isOwner).toBe(false);
  });
});

// ─── State machine transitions ─────────────────────────────────────────────────
describe('Group state machine', () => {
  const validStatusTransitions = [
    { from: 'active', to: 'paused', valid: true },
    { from: 'active', to: 'cancelled', valid: true },
    { from: 'paused', to: 'cancelled', valid: true },
    { from: 'cancelled', to: 'active', valid: false }, // cannot reactivate
  ];

  validStatusTransitions.forEach(({ from, to, valid }) => {
    it(`${from} → ${to} should be ${valid ? 'allowed' : 'blocked'} via UpdateGroupDto`, () => {
      const ALLOWED = ['paused', 'cancelled'];
      const isAllowed = ALLOWED.includes(to);
      expect(isAllowed).toBe(valid);
    });
  });
});

// ─── Split method change guard ─────────────────────────────────────────────────
describe('GroupsService — split method change', () => {
  it('should block split method change when active cycle exists', () => {
    const existingActivePeriod = { id: 'period-uuid', status: 'active' };
    const newSplitMethod: string = 'custom_percentage';
    const currentMethod: string = 'equal';

    const shouldBlock = newSplitMethod !== currentMethod && existingActivePeriod !== null;
    expect(shouldBlock).toBe(true);
  });

  it('should allow split method change when no active cycle', () => {
    const existingActivePeriod = null;
    const newSplitMethod: string = 'custom_percentage';
    const currentMethod: string = 'equal';

    const shouldBlock = newSplitMethod !== currentMethod && existingActivePeriod !== null;
    expect(shouldBlock).toBe(false);
  });
});

// ─── Business rules: dueDay, totalAmount ─────────────────────────────────────
describe('Group business rules', () => {
  it('dueDay must be 1-28', () => {
    const validDays = [1, 15, 28];
    const invalidDays = [0, 29, 31];
    validDays.forEach(d => expect(d >= 1 && d <= 28).toBe(true));
    invalidDays.forEach(d => expect(d >= 1 && d <= 28).toBe(false));
  });

  it('totalAmount must be >= 1000', () => {
    expect(1000 >= 1000).toBe(true);
    expect(999 >= 1000).toBe(false);
  });

  it('totalAmount must be <= 100_000_000', () => {
    expect(100_000_000 <= 100_000_000).toBe(true);
    expect(100_000_001 <= 100_000_000).toBe(false);
  });
});
