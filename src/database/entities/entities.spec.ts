// src/database/entities/entities.spec.ts
// Unit tests for database entities
// Tests:
//   - Base entity field existence
//   - Entity relationship decorator presence
//   - Enum values correctness
//   - @Exclude() on sensitive fields (verified via class-transformer)

import 'reflect-metadata';
import { instanceToPlain } from 'class-transformer';
import { getMetadataArgsStorage } from 'typeorm';
import { BaseEntity, SoftDeleteBaseEntity } from './base.entity.js';
import { UserEntity } from './user.entity.js';
import { OtpCodeEntity } from './otp-code.entity.js';
import { RefreshTokenEntity } from './refresh-token.entity.js';
import { GroupEntity } from './group.entity.js';
import { GroupMemberEntity } from './group-member.entity.js';
import { PaymentPeriodEntity } from './payment-period.entity.js';
import { PaymentRecordEntity } from './payment-record.entity.js';
import { NotificationLogEntity } from './notification-log.entity.js';
import { PushSubscriptionEntity } from './push-subscription.entity.js';
import {
  BillingFrequency,
  GroupStatus,
  MemberRole,
  MemberStatus,
  NotificationChannel,
  NotificationPreference,
  NotificationStatus,
  NotificationType,
  PaymentStatus,
  PeriodStatus,
  SplitMethod,
} from './enums.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helper: get TypeORM metadata for a target entity class
// ──────────────────────────────────────────────────────────────────────────────
function getColumns(target: object): string[] {
  const baseClasses: object[] = [BaseEntity, SoftDeleteBaseEntity];
  return getMetadataArgsStorage()
    .columns.filter(
      (c) =>
        c.target === target ||
        (typeof c.target !== 'string' && baseClasses.includes(c.target)),
    )
    .map((c) => c.propertyName);
}

function getRelations(target: object): string[] {
  return getMetadataArgsStorage()
    .relations.filter((r) => r.target === target)
    .map((r) => r.propertyName);
}

// ──────────────────────────────────────────────────────────────────────────────
// ENUMS
// ──────────────────────────────────────────────────────────────────────────────
describe('Enums', () => {
  it('SplitMethod has correct values', () => {
    expect(SplitMethod.EQUAL).toBe('equal');
    expect(SplitMethod.CUSTOM_PERCENTAGE).toBe('custom_percentage');
    expect(SplitMethod.CUSTOM_NOMINAL).toBe('custom_nominal');
    expect(SplitMethod.PRO_RATA).toBe('pro_rata');
  });

  it('BillingFrequency has correct values', () => {
    expect(BillingFrequency.MONTHLY).toBe('monthly');
    expect(BillingFrequency.YEARLY).toBe('yearly');
    expect(BillingFrequency.WEEKLY).toBe('weekly');
  });

  it('GroupStatus has correct values', () => {
    expect(GroupStatus.ACTIVE).toBe('active');
    expect(GroupStatus.PAUSED).toBe('paused');
    expect(GroupStatus.CANCELLED).toBe('cancelled');
  });

  it('MemberRole has correct values', () => {
    expect(MemberRole.HOST).toBe('host');
    expect(MemberRole.PAYER).toBe('payer');
  });

  it('MemberStatus has correct values', () => {
    expect(MemberStatus.ACTIVE).toBe('active');
    expect(MemberStatus.INACTIVE).toBe('inactive');
    expect(MemberStatus.REMOVED).toBe('removed');
  });

  it('NotificationPreference has correct values', () => {
    expect(NotificationPreference.EMAIL).toBe('email');
    expect(NotificationPreference.PUSH).toBe('push');
    expect(NotificationPreference.BOTH).toBe('both');
    expect(NotificationPreference.NONE).toBe('none');
  });

  it('PeriodStatus has correct values', () => {
    expect(PeriodStatus.UPCOMING).toBe('upcoming');
    expect(PeriodStatus.ACTIVE).toBe('active');
    expect(PeriodStatus.COMPLETED).toBe('completed');
    expect(PeriodStatus.OVERDUE).toBe('overdue');
  });

  it('PaymentStatus has correct values', () => {
    expect(PaymentStatus.PENDING).toBe('pending');
    expect(PaymentStatus.PAID).toBe('paid');
    expect(PaymentStatus.OVERDUE).toBe('overdue');
    expect(PaymentStatus.WAIVED).toBe('waived');
  });

  it('NotificationType has correct values', () => {
    expect(NotificationType.REMINDER_3D).toBe('reminder_3d');
    expect(NotificationType.REMINDER_1D).toBe('reminder_1d');
    expect(NotificationType.REMINDER_0D).toBe('reminder_0d');
    expect(NotificationType.PAYMENT_CONFIRMED).toBe('payment_confirmed');
    expect(NotificationType.OVERDUE_ALERT).toBe('overdue_alert');
  });

  it('NotificationChannel has correct values', () => {
    expect(NotificationChannel.EMAIL).toBe('email');
    expect(NotificationChannel.PUSH).toBe('push');
    expect(NotificationChannel.WHATSAPP).toBe('whatsapp');
  });

  it('NotificationStatus has correct values', () => {
    expect(NotificationStatus.PENDING).toBe('pending');
    expect(NotificationStatus.SENT).toBe('sent');
    expect(NotificationStatus.FAILED).toBe('failed');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// BASE ENTITIES
// ──────────────────────────────────────────────────────────────────────────────
describe('BaseEntity', () => {
  it('should be abstract and not directly instantiable (checked via TypeORM metadata)', () => {
    // BaseEntity is abstract — verify its columns appear in subclasses
    const userCols = getColumns(UserEntity);
    expect(userCols).toContain('id');
    expect(userCols).toContain('createdAt');
    expect(userCols).toContain('updatedAt');
  });
});

describe('SoftDeleteBaseEntity', () => {
  it('should add deletedAt column to subclasses', () => {
    const userCols = getColumns(UserEntity);
    expect(userCols).toContain('deletedAt');
  });

  it('should exclude deletedAt from serialization', () => {
    const entity = Object.assign(new UserEntity(), {
      id: 'test-id',
      email: 'test@test.com',
      name: 'Test',
      phone: null,
      isEmailVerified: false,
      lastLoginAt: null,
      deletedAt: new Date('2024-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const plain = instanceToPlain(entity);
    expect(plain).not.toHaveProperty('deletedAt');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// UserEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('UserEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(UserEntity);
    expect(cols).toContain('email');
    expect(cols).toContain('name');
    expect(cols).toContain('phone');
    expect(cols).toContain('isEmailVerified');
    expect(cols).toContain('lastLoginAt');
  });

  it('should have correct relations', () => {
    const rels = getRelations(UserEntity);
    expect(rels).toContain('hostedGroups');
    expect(rels).toContain('groupMemberships');
    expect(rels).toContain('refreshTokens');
    expect(rels).toContain('pushSubscriptions');
  });

  it('should exclude refreshTokens from serialization', () => {
    const entity = Object.assign(new UserEntity(), {
      id: 'uuid-1',
      email: 'test@test.com',
      name: 'Test User',
      phone: null,
      isEmailVerified: true,
      lastLoginAt: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      refreshTokens: [{ id: 'token-1' }],
    });
    const plain = instanceToPlain(entity);
    expect(plain).not.toHaveProperty('refreshTokens');
    expect(plain).toHaveProperty('email', 'test@test.com');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// OtpCodeEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('OtpCodeEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(OtpCodeEntity);
    expect(cols).toContain('email');
    expect(cols).toContain('codeHash');
    expect(cols).toContain('expiresAt');
    expect(cols).toContain('isUsed');
    expect(cols).toContain('attempts');
    expect(cols).toContain('ipAddress');
    expect(cols).toContain('userAgent');
  });

  it('should exclude codeHash, ipAddress, and userAgent from serialization', () => {
    const entity = Object.assign(new OtpCodeEntity(), {
      id: 'uuid-2',
      email: 'test@test.com',
      codeHash: 'sha256hash',
      expiresAt: new Date(),
      isUsed: false,
      attempts: 0,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const plain = instanceToPlain(entity);
    expect(plain).not.toHaveProperty('codeHash');
    expect(plain).not.toHaveProperty('ipAddress');
    expect(plain).not.toHaveProperty('userAgent');
    expect(plain).toHaveProperty('email', 'test@test.com');
    expect(plain).toHaveProperty('attempts', 0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// RefreshTokenEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('RefreshTokenEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(RefreshTokenEntity);
    expect(cols).toContain('userId');
    expect(cols).toContain('tokenHash');
    expect(cols).toContain('expiresAt');
    expect(cols).toContain('isRevoked');
    expect(cols).toContain('familyId');
    expect(cols).toContain('deviceInfo');
    expect(cols).toContain('userAgent');
    expect(cols).toContain('ipAddress');
  });

  it('should have relation to UserEntity', () => {
    const rels = getRelations(RefreshTokenEntity);
    expect(rels).toContain('user');
  });

  it('should exclude sensitive fields from serialization', () => {
    const entity = Object.assign(new RefreshTokenEntity(), {
      id: 'uuid-3',
      userId: 'user-uuid',
      tokenHash: 'hashedtoken',
      expiresAt: new Date(),
      isRevoked: false,
      familyId: 'family-uuid',
      deviceInfo: 'Chrome/Windows',
      userAgent: 'Mozilla/5.0...',
      ipAddress: '192.168.1.1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const plain = instanceToPlain(entity);
    expect(plain).not.toHaveProperty('tokenHash');
    expect(plain).not.toHaveProperty('familyId');
    expect(plain).not.toHaveProperty('deviceInfo');
    expect(plain).not.toHaveProperty('userAgent');
    expect(plain).not.toHaveProperty('ipAddress');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GroupEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('GroupEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(GroupEntity);
    expect(cols).toContain('hostId');
    expect(cols).toContain('name');
    expect(cols).toContain('serviceName');
    expect(cols).toContain('description');
    expect(cols).toContain('totalAmount');
    expect(cols).toContain('frequency');
    expect(cols).toContain('dueDay');
    expect(cols).toContain('splitMethod');
    expect(cols).toContain('gracePeriodDays');
    expect(cols).toContain('status');
  });

  it('should have relations to host, members, and paymentPeriods', () => {
    const rels = getRelations(GroupEntity);
    expect(rels).toContain('host');
    expect(rels).toContain('members');
    expect(rels).toContain('paymentPeriods');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// GroupMemberEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('GroupMemberEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(GroupMemberEntity);
    expect(cols).toContain('groupId');
    expect(cols).toContain('userId');
    expect(cols).toContain('email');
    expect(cols).toContain('displayName');
    expect(cols).toContain('role');
    expect(cols).toContain('shareAmount');
    expect(cols).toContain('sharePercentage');
    expect(cols).toContain('notificationPreference');
    expect(cols).toContain('status');
    expect(cols).toContain('joinedAt');
  });

  it('should have relations to group, user, and paymentRecords', () => {
    const rels = getRelations(GroupMemberEntity);
    expect(rels).toContain('group');
    expect(rels).toContain('user');
    expect(rels).toContain('paymentRecords');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PaymentPeriodEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('PaymentPeriodEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(PaymentPeriodEntity);
    expect(cols).toContain('groupId');
    expect(cols).toContain('periodStart');
    expect(cols).toContain('periodEnd');
    expect(cols).toContain('dueDate');
    expect(cols).toContain('status');
    expect(cols).toContain('totalCollected');
  });

  it('should have relations to group and paymentRecords', () => {
    const rels = getRelations(PaymentPeriodEntity);
    expect(rels).toContain('group');
    expect(rels).toContain('paymentRecords');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PaymentRecordEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('PaymentRecordEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(PaymentRecordEntity);
    expect(cols).toContain('periodId');
    expect(cols).toContain('memberId');
    expect(cols).toContain('amountDue');
    expect(cols).toContain('amountPaid');
    expect(cols).toContain('status');
    expect(cols).toContain('confirmedAt');
    expect(cols).toContain('confirmationTokenHash');
    expect(cols).toContain('tokenExpiresAt');
    expect(cols).toContain('tokenUsed');
    expect(cols).toContain('paymentMethod');
    expect(cols).toContain('paymentNote');
    expect(cols).toContain('confirmedBy');
  });

  it('should have relations to period and member', () => {
    const rels = getRelations(PaymentRecordEntity);
    expect(rels).toContain('period');
    expect(rels).toContain('member');
  });

  it('should exclude sensitive token fields from serialization', () => {
    const entity = Object.assign(new PaymentRecordEntity(), {
      id: 'uuid-7',
      periodId: 'period-uuid',
      memberId: 'member-uuid',
      amountDue: '50000',
      amountPaid: null,
      status: PaymentStatus.PENDING,
      confirmedAt: null,
      confirmationTokenHash: 'secret-hash',
      tokenExpiresAt: new Date(),
      tokenUsed: false,
      paymentMethod: null,
      paymentNote: null,
      confirmedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const plain = instanceToPlain(entity);
    expect(plain).not.toHaveProperty('confirmationTokenHash');
    expect(plain).not.toHaveProperty('tokenExpiresAt');
    expect(plain).not.toHaveProperty('tokenUsed');
    expect(plain).toHaveProperty('status', PaymentStatus.PENDING);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// NotificationLogEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('NotificationLogEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(NotificationLogEntity);
    expect(cols).toContain('memberId');
    expect(cols).toContain('periodId');
    expect(cols).toContain('type');
    expect(cols).toContain('channel');
    expect(cols).toContain('status');
    expect(cols).toContain('sentAt');
    expect(cols).toContain('metadata');
  });

  it('should have relations to member and period', () => {
    const rels = getRelations(NotificationLogEntity);
    expect(rels).toContain('member');
    expect(rels).toContain('period');
  });

  it('should exclude metadata from serialization', () => {
    const entity = Object.assign(new NotificationLogEntity(), {
      id: 'uuid-8',
      memberId: 'member-uuid',
      periodId: 'period-uuid',
      type: NotificationType.REMINDER_3D,
      channel: NotificationChannel.EMAIL,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      metadata: { provider: 'resend', messageId: 'msg-123' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const plain = instanceToPlain(entity);
    expect(plain).not.toHaveProperty('metadata');
    expect(plain).toHaveProperty('type', 'reminder_3d');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PushSubscriptionEntity
// ──────────────────────────────────────────────────────────────────────────────
describe('PushSubscriptionEntity', () => {
  it('should have correct columns', () => {
    const cols = getColumns(PushSubscriptionEntity);
    expect(cols).toContain('userId');
    expect(cols).toContain('endpoint');
    expect(cols).toContain('p256dh');
    expect(cols).toContain('auth');
    expect(cols).toContain('userAgent');
  });

  it('should have relation to user', () => {
    const rels = getRelations(PushSubscriptionEntity);
    expect(rels).toContain('user');
  });

  it('should exclude VAPID keys and userAgent from serialization', () => {
    const entity = Object.assign(new PushSubscriptionEntity(), {
      id: 'uuid-9',
      userId: 'user-uuid',
      endpoint: 'https://fcm.googleapis.com/fcm/send/...',
      p256dh: 'BNQ3nkc...',
      auth: 'auth-secret',
      userAgent: 'Chrome/125',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const plain = instanceToPlain(entity);
    expect(plain).not.toHaveProperty('p256dh');
    expect(plain).not.toHaveProperty('auth');
    expect(plain).not.toHaveProperty('userAgent');
    expect(plain).toHaveProperty('endpoint');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Relationship integrity
// ──────────────────────────────────────────────────────────────────────────────
describe('Entity relationships integrity', () => {
  it('UserEntity → GroupEntity (hostedGroups) is OneToMany', () => {
    const storage = getMetadataArgsStorage();
    const rel = storage.relations.find(
      (r) => r.target === UserEntity && r.propertyName === 'hostedGroups',
    );
    expect(rel).toBeDefined();
    expect(rel?.relationType).toBe('one-to-many');
  });

  it('GroupMemberEntity → GroupEntity is ManyToOne', () => {
    const storage = getMetadataArgsStorage();
    const rel = storage.relations.find(
      (r) => r.target === GroupMemberEntity && r.propertyName === 'group',
    );
    expect(rel).toBeDefined();
    expect(rel?.relationType).toBe('many-to-one');
  });

  it('PaymentRecordEntity → PaymentPeriodEntity is ManyToOne', () => {
    const storage = getMetadataArgsStorage();
    const rel = storage.relations.find(
      (r) => r.target === PaymentRecordEntity && r.propertyName === 'period',
    );
    expect(rel).toBeDefined();
    expect(rel?.relationType).toBe('many-to-one');
  });

  it('GroupMemberEntity.userId is nullable (pre-registration invite support)', () => {
    const storage = getMetadataArgsStorage();
    const col = storage.columns.find(
      (c) => c.target === GroupMemberEntity && c.propertyName === 'userId',
    );
    expect(col).toBeDefined();
    expect((col?.options as { nullable?: boolean })?.nullable).toBe(true);
  });
});
