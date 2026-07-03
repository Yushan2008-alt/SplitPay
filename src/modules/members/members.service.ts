// src/modules/members/members.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupMemberEntity,
  MemberRole,
  MemberStatus,
  NotificationPreference,
  SplitMethod,
  PaymentStatus,
} from '../../database/entities/index.js';
import { ErrorCode } from '../../common/constants/error-codes.js';
import {
  GroupMemberRepository,
  GroupRepository,
  PaymentPeriodRepository,
  PaymentRecordRepository,
} from '../../database/repositories/index.js';
import { UsersService } from '../users/users.service.js';
import { SplitCalculationService } from '../split/split-calculation.service.js';
import type { AddMemberDto } from './dto/add-member.dto.js';
import type { UpdateMemberDto } from './dto/update-member.dto.js';

const MAX_MEMBERS = 20;

@Injectable()
export class MembersService {
  constructor(
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly usersService: UsersService,
    private readonly splitService: SplitCalculationService,
    private readonly periodRepo: PaymentPeriodRepository,
    private readonly recordRepo: PaymentRecordRepository,
  ) {}

  // ─── ADD ──────────────────────────────────────────────────────────────────

  async addMember(
    groupId: string,
    hostUserId: string,
    dto: AddMemberDto,
  ): Promise<GroupMemberEntity> {
    // Assert host
    const group = await this.groupRepo.findById(groupId);
    if (!group || group.hostId !== hostUserId) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_HOST,
        message: 'Hanya host yang dapat menambahkan anggota',
      });
    }

    // Max 20 members check
    const currentCount = await this.memberRepo.countActiveByGroup(groupId);
    if (currentCount >= MAX_MEMBERS) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Grup sudah mencapai batas maksimal ${MAX_MEMBERS} anggota`,
      });
    }

    const email = dto.email.toLowerCase().trim();

    // Check for active member (duplicate)
    const activeMember = await this.memberRepo.findByGroupAndEmail(groupId, email);
    if (activeMember) {
      throw new ConflictException({
        code: ErrorCode.MEMBER_ALREADY_EXISTS,
        message: 'Email ini sudah menjadi anggota grup',
      });
    }

    // Check for soft-deleted member to revive
    const deletedMember = await this.memberRepo.findDeletedByGroupAndEmail(groupId, email);

    if (deletedMember) {
      // Validate split constraint before reactivating
      this.splitService.validateBeforeAdd(
        group,
        currentCount,
        dto.shareAmount,
        dto.sharePercentage,
      );

      const user = await this.usersService.findByEmail(email);
      const newCount = currentCount + 1;

      let shareAmount = dto.shareAmount ?? 0;
      let sharePercentage = dto.sharePercentage ?? null;

      if (group.splitMethod === SplitMethod.EQUAL) {
        const totalCost = parseFloat(group.totalAmount);
        shareAmount = Math.floor((totalCost * 100) / newCount) / 100;
        sharePercentage = null;
      }

      // ponytail: restore soft-deleted member instead of INSERT to avoid PK/unique conflicts
      await this.memberRepo.restore(deletedMember.id);
      await this.memberRepo.update(deletedMember.id, {
        userId: user?.id ?? deletedMember.userId,
        displayName: dto.displayName,
        shareAmount: String(shareAmount),
        sharePercentage: sharePercentage !== null ? String(sharePercentage) : null,
        notificationPreference: dto.notificationPreference ?? NotificationPreference.BOTH,
        status: MemberStatus.ACTIVE,
      });

      if (group.splitMethod === SplitMethod.EQUAL) {
        await this.recalculateEqualShares(groupId);
      }

      // B1: Ensure payment records exist for upcoming periods
      const upcoming = await this.periodRepo.findAllUpcomingByGroup(groupId);
      const newShare = String(shareAmount);
      for (const period of upcoming) {
        const existing = await this.recordRepo.findByPeriodAndMember(period.id, deletedMember.id);
        if (existing) {
          await this.recordRepo.update(existing.id, { amountDue: newShare, status: PaymentStatus.PENDING });
        } else {
          await this.recordRepo.createEntity({
            periodId: period.id,
            memberId: deletedMember.id,
            amountDue: newShare,
            status: PaymentStatus.PENDING,
          });
        }
      }

      return this.memberRepo.findById(deletedMember.id) as Promise<GroupMemberEntity>;
    }

    // Validate split constraint before adding
    this.splitService.validateBeforeAdd(
      group,
      currentCount,
      dto.shareAmount,
      dto.sharePercentage,
    );

    // Find or resolve user by email (user may not be registered yet)
    const user = await this.usersService.findByEmail(email);

    // Compute shareAmount for EQUAL method
    let shareAmount = dto.shareAmount ?? 0;
    let sharePercentage = dto.sharePercentage ?? null;

    if (group.splitMethod === SplitMethod.EQUAL) {
      const totalCost = parseFloat(group.totalAmount);
      const newCount = currentCount + 1;
      shareAmount = Math.floor((totalCost * 100) / newCount) / 100;
      sharePercentage = null;
    }

    const member = await this.memberRepo.createEntity({
      groupId,
      userId: user?.id ?? null,
      email,
      displayName: dto.displayName,
      role: MemberRole.PAYER,
      shareAmount: String(shareAmount),
      sharePercentage: sharePercentage !== null ? String(sharePercentage) : null,
      notificationPreference: dto.notificationPreference ?? NotificationPreference.BOTH,
      status: MemberStatus.ACTIVE,
    });

    // Recalculate and update all members' shares for EQUAL split
    if (group.splitMethod === SplitMethod.EQUAL) {
      await this.recalculateEqualShares(groupId);
    }

    // B1: Create payment records for new member in all upcoming periods
    const upcoming = await this.periodRepo.findAllUpcomingByGroup(groupId);
    const newShare = String(shareAmount);
    for (const period of upcoming) {
      const existing = await this.recordRepo.findByPeriodAndMember(period.id, member.id);
      if (!existing) {
        await this.recordRepo.createEntity({
          periodId: period.id,
          memberId: member.id,
          amountDue: newShare,
          status: PaymentStatus.PENDING,
        });
      }
    }

    return member;
  }

  // ─── LIST ─────────────────────────────────────────────────────────────────

  async listMembers(
    groupId: string,
    requestorId: string,
  ): Promise<GroupMemberEntity[]> {
    // Verify requestor is a member
    const group = await this.groupRepo.findById(groupId);
    if (!group) {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Grup tidak ditemukan',
      });
    }

    const isHost = group.hostId === requestorId;
    if (!isHost) {
      const m = await this.memberRepo.findByGroupAndUser(groupId, requestorId);
      if (!m || m.status !== MemberStatus.ACTIVE) {
        throw new ForbiddenException({
          code: ErrorCode.FORBIDDEN,
          message: 'Anda bukan anggota grup ini',
        });
      }
    }

    return this.memberRepo.findActiveByGroup(groupId);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  async updateMember(
    groupId: string,
    memberId: string,
    requestorId: string,
    dto: UpdateMemberDto,
  ): Promise<GroupMemberEntity> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) {
      throw new NotFoundException({ code: ErrorCode.GROUP_NOT_FOUND, message: 'Grup tidak ditemukan' });
    }

    const member = await this.memberRepo.findById(memberId);
    if (!member || member.groupId !== groupId || member.status !== MemberStatus.ACTIVE) {
      throw new NotFoundException({ code: ErrorCode.MEMBER_NOT_FOUND, message: 'Anggota tidak ditemukan' });
    }

    const isHost = group.hostId === requestorId;
    const isSelf = member.userId === requestorId;

    if (!isHost && !isSelf) {
      throw new ForbiddenException({ code: ErrorCode.FORBIDDEN, message: 'Akses ditolak' });
    }

    const updateData: Partial<GroupMemberEntity> = {};

    if (dto.notificationPreference !== undefined) {
      updateData.notificationPreference = dto.notificationPreference;
    }

    // Only HOST can update shares
    if (isHost) {
      if (dto.shareAmount !== undefined) updateData.shareAmount = String(dto.shareAmount);
      if (dto.sharePercentage !== undefined) updateData.sharePercentage = String(dto.sharePercentage);
    }

    return this.memberRepo.update(memberId, updateData);
  }

  // ─── REMOVE ───────────────────────────────────────────────────────────────

  async removeMember(
    groupId: string,
    memberId: string,
    hostUserId: string,
  ): Promise<void> {
    const group = await this.groupRepo.findById(groupId);
    if (!group || group.hostId !== hostUserId) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_HOST,
        message: 'Hanya host yang dapat menghapus anggota',
      });
    }

    const member = await this.memberRepo.findById(memberId);
    if (!member || member.groupId !== groupId) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Anggota tidak ditemukan',
      });
    }

    // Host cannot remove themselves
    if (member.userId === hostUserId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Host tidak dapat menghapus diri sendiri dari grup',
      });
    }

    await this.memberRepo.update(memberId, { status: MemberStatus.REMOVED });
    await this.memberRepo.softDelete(memberId);

    // Recalculate EQUAL shares after removal
    if (group.splitMethod === SplitMethod.EQUAL) {
      await this.recalculateEqualShares(groupId);
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  /** After any EQUAL group membership change, recalculate all members' share */
  private async recalculateEqualShares(groupId: string): Promise<void> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) return;

    const members = await this.memberRepo.findActiveByGroup(groupId);
    if (members.length === 0) return;

    const totalCents = Math.round(parseFloat(group.totalAmount) * 100);
    const base = Math.floor(totalCents / members.length);
    const remainder = totalCents - base * members.length;

    const updatedShares: Map<string, string> = new Map();
    for (let i = 0; i < members.length; i++) {
      const amountCents = base + (i === 0 ? remainder : 0);
      const shareStr = String(amountCents / 100);
      await this.memberRepo.update(members[i].id, {
        shareAmount: shareStr,
      });
      updatedShares.set(members[i].id, shareStr);
    }

    // B2: Sync payment record amounts in existing upcoming periods
    const upcoming = await this.periodRepo.findAllUpcomingByGroup(groupId);
    for (const period of upcoming) {
      const records = await this.recordRepo.findByPeriodId(period.id);
      for (const rec of records) {
        const newAmount = updatedShares.get(rec.memberId);
        if (newAmount && rec.amountDue !== newAmount && rec.status === PaymentStatus.PENDING) {
          await this.recordRepo.update(rec.id, { amountDue: newAmount });
        }
      }
    }
  }

  /** Expose repo for controller-level access if needed */
  get repo(): GroupMemberRepository {
    return this.memberRepo;
  }
}
