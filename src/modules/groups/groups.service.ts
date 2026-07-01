// src/modules/groups/groups.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupEntity,
  GroupMemberEntity,
  GroupStatus,
  MemberRole,
  MemberStatus,
  NotificationPreference,
  PaymentPeriodEntity,
  PeriodStatus,
  SplitMethod,
} from '../../database/entities/index.js';
import { ErrorCode } from '../../common/constants/error-codes.js';
import {
  GroupMemberRepository,
  GroupRepository,
  PaymentPeriodRepository,
} from '../../database/repositories/index.js';
import { UsersService } from '../users/users.service.js';
import { BillingCycleService } from '../billing/billing-cycle.service.js';
import type { CreateGroupDto } from './dto/create-group.dto.js';
import type { UpdateGroupDto } from './dto/update-group.dto.js';

const MAX_MEMBERS = 20;

@Injectable()
export class GroupsService {
  constructor(
    private readonly groupRepo: GroupRepository,
    private readonly memberRepo: GroupMemberRepository,
    private readonly periodRepo: PaymentPeriodRepository,
    private readonly usersService: UsersService,
    private readonly billingService: BillingCycleService,
  ) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────

  async createGroup(
    hostUserId: string,
    dto: CreateGroupDto,
  ): Promise<GroupEntity> {
    const host = await this.usersService.findById(hostUserId);
    if (!host) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'Pengguna tidak ditemukan',
      });
    }

    const group = await this.groupRepo.createEntity({
      hostId: hostUserId,
      name: dto.name,
      serviceName: dto.serviceName,
      description: dto.description ?? null,
      totalAmount: String(dto.totalAmount),
      frequency: dto.frequency,
      dueDay: dto.dueDay,
      splitMethod: dto.splitMethod,
      gracePeriodDays: dto.gracePeriodDays ?? 3,
      status: GroupStatus.ACTIVE,
    });

    // Auto-add host as first member with role HOST
    await this.memberRepo.createEntity({
      groupId: group.id,
      userId: hostUserId,
      email: host.email,
      displayName: host.name,
      role: MemberRole.HOST,
      shareAmount:
        dto.splitMethod === SplitMethod.EQUAL
          ? String(dto.totalAmount)
          : '0',
      sharePercentage: null,
      notificationPreference: NotificationPreference.BOTH,
      status: MemberStatus.ACTIVE,
    });

    // Generate first billing cycle
    try {
      await this.billingService.generateNextCycle(group.id);
    } catch (err) {
      // ponytail: non-fatal — group created, scheduler retries later
      new Logger(GroupsService.name).warn(
        `Failed to generate first billing cycle for group ${group.id}: ${(err as Error).message}`,
      );
    }

    return group;
  }

  // ─── LIST ─────────────────────────────────────────────────────────────────

  async listMyGroups(userId: string): Promise<
    Array<{
      group: GroupEntity;
      myRole: MemberRole;
      memberCount: number;
      nextDueDate: string | null;
    }>
  > {
    // Groups where user is host
    const hostedGroups = await this.groupRepo.findByHostId(userId);

    // Groups where user is member (not host)
    const memberships = await this.memberRepo.findByUserId(userId);
    const memberGroupIds = memberships
      .filter((m) => m.status === MemberStatus.ACTIVE)
      .map((m) => m.groupId)
      .filter((gid) => !hostedGroups.some((g) => g.id === gid));

    const memberGroups =
      memberGroupIds.length > 0
        ? await this.groupRepo.findByIds(memberGroupIds)
        : [];

    const allGroups = [...hostedGroups, ...memberGroups];
    const allGroupIds = allGroups.map((g) => g.id);

    // Batch: member counts in 1 query instead of N
    const allActiveMembers =
      await this.memberRepo.findMembersByGroupIds(allGroupIds);
    const memberCountMap = new Map<string, number>();
    for (const m of allActiveMembers) {
      memberCountMap.set(m.groupId, (memberCountMap.get(m.groupId) ?? 0) + 1);
    }

    // Batch: periods in 1 query instead of up to 2N
    const periods =
      await this.periodRepo.findCurrentOrUpcomingByGroupIds(allGroupIds);
    const periodMap = new Map<string, PaymentPeriodEntity>();
    for (const p of periods) {
      if (!periodMap.has(p.groupId) || p.status === PeriodStatus.ACTIVE) {
        periodMap.set(p.groupId, p);
      }
    }

    // Membership lookup from already-fetched memberships
    const membershipMap = new Map(memberships.map((m) => [m.groupId, m]));

    return allGroups.map((group) => {
      const membership = membershipMap.get(group.id);
      const myRole =
        group.hostId === userId
          ? MemberRole.HOST
          : (membership?.role ?? MemberRole.PAYER);
      return {
        group,
        myRole,
        memberCount: memberCountMap.get(group.id) ?? 0,
        nextDueDate: periodMap.get(group.id)?.dueDate ?? null,
      };
    });
  }

  // ─── GET DETAIL ───────────────────────────────────────────────────────────

  async getGroupWithMembers(
    groupId: string,
    userId: string,
  ): Promise<{
    group: GroupEntity;
    members: GroupMemberEntity[];
    currentPeriod:
      import('../../database/entities/index.js').PaymentPeriodEntity | null;
    myRole: MemberRole;
  }> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Grup tidak ditemukan',
      });
    }

    await this.assertGroupMembership(groupId, userId);

    const [members, currentPeriod, membership] = await Promise.all([
      this.memberRepo.findActiveByGroup(groupId),
      this.periodRepo.findCurrentByGroup(groupId),
      this.memberRepo.findByGroupAndUser(groupId, userId),
    ]);

    const myRole =
      group.hostId === userId
        ? MemberRole.HOST
        : (membership?.role ?? MemberRole.PAYER);

    return { group, members, currentPeriod, myRole };
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  async updateGroup(
    groupId: string,
    hostUserId: string,
    dto: UpdateGroupDto,
  ): Promise<GroupEntity> {
    await this.assertGroupOwner(groupId, hostUserId);

    const group = await this.groupRepo.findByIdOrFail(groupId);

    // Block split method change if active cycle exists
    if (dto.splitMethod && dto.splitMethod !== group.splitMethod) {
      const activePeriod = await this.periodRepo.findCurrentByGroup(groupId);
      if (activePeriod) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message:
            'Tidak dapat mengubah metode split saat ada siklus pembayaran aktif',
        });
      }
    }

    if (dto.status && group.status === GroupStatus.CANCELLED) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Grup sudah dibatalkan, tidak dapat mengubah status',
      });
    }

    const updateData: Partial<GroupEntity> = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.serviceName) updateData.serviceName = dto.serviceName;
    if (dto.description !== undefined)
      updateData.description = dto.description ?? null;
    if (dto.totalAmount) updateData.totalAmount = String(dto.totalAmount);
    if (dto.frequency) updateData.frequency = dto.frequency;
    if (dto.dueDay) updateData.dueDay = dto.dueDay;
    if (dto.splitMethod) updateData.splitMethod = dto.splitMethod;
    if (dto.gracePeriodDays !== undefined)
      updateData.gracePeriodDays = dto.gracePeriodDays;
    if (dto.status) updateData.status = dto.status as GroupStatus;

    return this.groupRepo.update(groupId, updateData);
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  async deleteGroup(groupId: string, hostUserId: string): Promise<void> {
    await this.assertGroupOwner(groupId, hostUserId);
    const activePeriod = await this.periodRepo.findCurrentByGroup(groupId);
    if (activePeriod) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'Tidak dapat menghapus grup yang memiliki siklus pembayaran aktif',
      });
    }
    await this.groupRepo.softDelete(groupId);
  }

  // ─── GUARD HELPERS ────────────────────────────────────────────────────────

  /**
   * Throws 403 (not 404) if caller is not the group host.
   * PRD requirement: don't reveal existence of group to non-members.
   */
  async assertGroupOwner(
    groupId: string,
    userId: string,
  ): Promise<GroupEntity> {
    const group = await this.groupRepo.findById(groupId);
    if (!group || group.hostId !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_HOST,
        message: 'Aksi ini hanya bisa dilakukan oleh host grup',
      });
    }
    return group;
  }

  /**
   * Throws 403 if caller is not an active member of the group.
   */
  async assertGroupMembership(groupId: string, userId: string): Promise<void> {
    const group = await this.groupRepo.findById(groupId);
    if (!group) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Akses ditolak',
      });
    }

    if (group.hostId === userId) return; // host is always a member

    const member = await this.memberRepo.findByGroupAndUser(groupId, userId);
    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Anda bukan anggota grup ini',
      });
    }
  }
}
