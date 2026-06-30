// src/database/seeders/seed.ts
// Development seed data for SplitPay
// Run: pnpm build && node dist/database/seeders/seed.js
//
// Seed creates:
//   - 2 users (1 host, 1 member)
//   - 1 group (Netflix)
//   - 2 group_members
//   - 1 payment_period (current month)
//   - 2 payment_records

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { UserEntity } from '../entities/user.entity.js';
import { GroupEntity } from '../entities/group.entity.js';
import { GroupMemberEntity } from '../entities/group-member.entity.js';
import { PaymentPeriodEntity } from '../entities/payment-period.entity.js';
import { PaymentRecordEntity } from '../entities/payment-record.entity.js';
import {
  BillingFrequency,
  GroupStatus,
  MemberRole,
  MemberStatus,
  NotificationPreference,
  PaymentStatus,
  PeriodStatus,
  SplitMethod,
} from '../entities/enums.js';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: false,
  entities: [
    UserEntity,
    GroupEntity,
    GroupMemberEntity,
    PaymentPeriodEntity,
    PaymentRecordEntity,
  ],
  synchronize: false,
  logging: true,
});

async function seed(): Promise<void> {
  await AppDataSource.initialize();
  console.log('📦 Database connected. Starting seed...');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const userRepo = AppDataSource.getRepository(UserEntity);
    const groupRepo = AppDataSource.getRepository(GroupEntity);
    const memberRepo = AppDataSource.getRepository(GroupMemberEntity);
    const periodRepo = AppDataSource.getRepository(PaymentPeriodEntity);
    const recordRepo = AppDataSource.getRepository(PaymentRecordEntity);

    // Idempotent: skip if data already exists
    const existingUser = await userRepo.findOneBy({
      email: 'host@splitpay.dev',
    });
    if (existingUser) {
      console.log('⚠️  Seed data already exists. Skipping.');
      await queryRunner.rollbackTransaction();
      return;
    }

    // ── Users ──
    const host = userRepo.create({
      email: 'host@splitpay.dev',
      name: 'Andi Wijaya',
      isEmailVerified: true,
    });
    const member = userRepo.create({
      email: 'member@splitpay.dev',
      name: 'Budi Santoso',
      isEmailVerified: true,
    });
    const [savedHost, savedMember] = await userRepo.save([host, member]);
    console.log(`✅ Created users: ${savedHost.id}, ${savedMember.id}`);

    // ── Group ──
    const group = groupRepo.create({
      hostId: savedHost.id,
      name: 'Netflix Family',
      serviceName: 'Netflix',
      description: 'Patungan Netflix family plan',
      totalAmount: '79000',
      frequency: BillingFrequency.MONTHLY,
      dueDay: 15,
      splitMethod: SplitMethod.EQUAL,
      gracePeriodDays: 3,
      status: GroupStatus.ACTIVE,
    });
    const savedGroup = await groupRepo.save(group);
    console.log(`✅ Created group: ${savedGroup.id}`);

    // ── Group Members ──
    const hostMember = memberRepo.create({
      groupId: savedGroup.id,
      userId: savedHost.id,
      email: savedHost.email,
      displayName: savedHost.name,
      role: MemberRole.HOST,
      shareAmount: '39500',
      sharePercentage: '50.00',
      notificationPreference: NotificationPreference.BOTH,
      status: MemberStatus.ACTIVE,
    });
    const payerMember = memberRepo.create({
      groupId: savedGroup.id,
      userId: savedMember.id,
      email: savedMember.email,
      displayName: savedMember.name,
      role: MemberRole.PAYER,
      shareAmount: '39500',
      sharePercentage: '50.00',
      notificationPreference: NotificationPreference.EMAIL,
      status: MemberStatus.ACTIVE,
    });
    const [savedHostMember, savedPayerMember] = await memberRepo.save([
      hostMember,
      payerMember,
    ]);
    console.log(
      `✅ Created group_members: ${savedHostMember.id}, ${savedPayerMember.id}`,
    );

    // ── Payment Period (current month) ──
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 15);

    const formatDate = (d: Date): string => d.toISOString().split('T')[0];

    const period = periodRepo.create({
      groupId: savedGroup.id,
      periodStart: formatDate(periodStart),
      periodEnd: formatDate(periodEnd),
      dueDate: formatDate(dueDate),
      status: PeriodStatus.ACTIVE,
      totalCollected: '0',
    });
    const savedPeriod = await periodRepo.save(period);
    console.log(`✅ Created payment_period: ${savedPeriod.id}`);

    // ── Payment Records ──
    const hostRecord = recordRepo.create({
      periodId: savedPeriod.id,
      memberId: savedHostMember.id,
      amountDue: '39500',
      status: PaymentStatus.PAID,
      confirmedAt: new Date(),
      confirmedBy: 'self',
    });
    const payerRecord = recordRepo.create({
      periodId: savedPeriod.id,
      memberId: savedPayerMember.id,
      amountDue: '39500',
      status: PaymentStatus.PENDING,
    });
    await recordRepo.save([hostRecord, payerRecord]);
    console.log(`✅ Created payment_records`);

    await queryRunner.commitTransaction();
    console.log('\n🎉 Seed completed successfully!');
    console.log(`   Host:   ${savedHost.email}`);
    console.log(`   Member: ${savedMember.email}`);
    console.log(`   Group:  ${savedGroup.name} (${savedGroup.id})`);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Seed failed, rolled back:', error);
    throw error;
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

void seed();
