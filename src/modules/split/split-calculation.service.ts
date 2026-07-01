// src/modules/split/split-calculation.service.ts
// Core split engine — all monetary arithmetic uses integer cents to avoid floating-point bugs
// All amounts are in RUPIAH. We work in integer "sen" (×100) then convert back.

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorCode } from '../../common/constants/error-codes.js';
import {
  GroupEntity,
  GroupMemberEntity,
  MemberStatus,
  SplitMethod,
} from '../../database/entities/index.js';

export interface MemberShare {
  memberId: string;
  email: string;
  shareAmount: number; // Rupiah integer
  sharePercentage?: number;
}

export interface SplitInput {
  memberId: string;
  email: string;
  sharePercentage?: number; // for CUSTOM_PERCENTAGE
  shareAmount?: number;     // for CUSTOM_NOMINAL
  joinDate?: Date;          // for PRO_RATA
}

/** Maximum allowed rounding error in Rupiah (1 Rp tolerance) */
const TOLERANCE = 1;

@Injectable()
export class SplitCalculationService {
  constructor(
    @InjectRepository(GroupEntity)
    private readonly groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly memberRepo: Repository<GroupMemberEntity>,
  ) {}

  /**
   * Master entry point — loads group + active members, dispatches to correct method.
   * Throws if invariant (sum === totalCost) is violated.
   */
  async calculateShares(groupId: string): Promise<MemberShare[]> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new BadRequestException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Grup tidak ditemukan',
      });
    }

    const members = await this.memberRepo.find({
      where: { groupId, status: MemberStatus.ACTIVE },
      order: { joinedAt: 'ASC' },
    });

    const totalCost = Math.round(parseFloat(group.totalAmount) * 100); // cents

    let shares: MemberShare[];

    switch (group.splitMethod) {
      case SplitMethod.EQUAL:
        shares = this.calculateEqual(totalCost, members);
        break;
      case SplitMethod.CUSTOM_PERCENTAGE:
        shares = this.calculateCustomPercent(totalCost, members);
        break;
      case SplitMethod.CUSTOM_NOMINAL:
        shares = this.calculateCustomNominal(totalCost, members);
        break;
      case SplitMethod.PRO_RATA:
        shares = this.calculateProRata(totalCost, members);
        break;
      default:
        throw new BadRequestException('Metode split tidak dikenal');
    }

    this.assertInvariant(
      totalCost,
      shares.map((s) => Math.round(s.shareAmount * 100)),
    );

    return shares;
  }

  // ─── EQUAL ────────────────────────────────────────────────────────────────

  /**
   * Divide totalCost evenly. Remainder (from floor division) goes to FIRST member.
   * Works in cents to avoid floating point.
   */
  calculateEqual(
    totalCostCents: number,
    members: GroupMemberEntity[],
  ): MemberShare[] {
    if (members.length === 0) return [];

    const base = Math.floor(totalCostCents / members.length);
    const remainder = totalCostCents - base * members.length;

    return members.map((m, i) => ({
      memberId: m.id,
      email: m.email,
      shareAmount: toRupiah(base + (i === 0 ? remainder : 0)),
      sharePercentage: undefined,
    }));
  }

  // ─── CUSTOM PERCENTAGE ────────────────────────────────────────────────────

  /**
   * Each member has a percentage. Validates total ≈ 100%.
   * Distributes remainder to member with LARGEST share to minimise visible error.
   */
  calculateCustomPercent(
    totalCostCents: number,
    members: GroupMemberEntity[],
  ): MemberShare[] {
    if (members.length === 0) return [];

    const percentages = members.map((m) =>
      m.sharePercentage ? parseFloat(m.sharePercentage) : 0,
    );
    const totalPct = percentages.reduce((a, b) => a + b, 0);

    if (Math.abs(totalPct - 100) > 0.01) {
      throw new BadRequestException({
        code: ErrorCode.SPLIT_AMOUNT_MISMATCH,
        message: `Total persentase harus 100%, saat ini ${totalPct.toFixed(2)}%`,
      });
    }

    const rawCents = percentages.map((pct) =>
      Math.floor((totalCostCents * pct) / 100),
    );
    const allocated = rawCents.reduce((a, b) => a + b, 0);
    const remainder = totalCostCents - allocated;

    // Give remainder to member with largest percentage
    const maxIdx = percentages.indexOf(Math.max(...percentages));

    return members.map((m, i) => ({
      memberId: m.id,
      email: m.email,
      shareAmount: toRupiah(rawCents[i] + (i === maxIdx ? remainder : 0)),
      sharePercentage: percentages[i],
    }));
  }

  // ─── CUSTOM NOMINAL ───────────────────────────────────────────────────────

  /**
   * Each member has a fixed nominal amount.
   * Sum MUST equal totalCost exactly (1 Rp tolerance for rounding).
   */
  calculateCustomNominal(
    totalCostCents: number,
    members: GroupMemberEntity[],
  ): MemberShare[] {
    if (members.length === 0) return [];

    const nominalsCents = members.map((m) =>
      Math.round(parseFloat(m.shareAmount) * 100),
    );
    const total = nominalsCents.reduce((a, b) => a + b, 0);

    if (Math.abs(total - totalCostCents) > TOLERANCE * 100) {
      throw new BadRequestException({
        code: ErrorCode.SPLIT_AMOUNT_MISMATCH,
        message: `Total nominal (${toRupiah(total)}) tidak sama dengan total biaya (${toRupiah(totalCostCents)})`,
      });
    }

    return members.map((m, i) => ({
      memberId: m.id,
      email: m.email,
      shareAmount: toRupiah(nominalsCents[i]),
    }));
  }

  // ─── PRO RATA ─────────────────────────────────────────────────────────────

  /**
   * Distribute by days active in period. Members joined mid-period pay less.
   * Remainder goes to member with most days.
   */
  calculateProRata(
    totalCostCents: number,
    members: GroupMemberEntity[],
    periodStart?: Date,
    periodEnd?: Date,
  ): MemberShare[] {
    if (members.length === 0) return [];

    const start = periodStart ?? new Date();
    const end =
      periodEnd ??
      new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());

    const totalDays = daysBetween(start, end);

    const activeDays = members.map((m) => {
      const joined = m.joinedAt > start ? m.joinedAt : start;
      return Math.max(1, daysBetween(joined, end));
    });

    const totalActiveDays = activeDays.reduce((a, b) => a + b, 0);

    const rawCents = activeDays.map((d) =>
      Math.floor((totalCostCents * d) / totalActiveDays),
    );
    const allocated = rawCents.reduce((a, b) => a + b, 0);
    const remainder = totalCostCents - allocated;

    // Remainder to member with most days
    const maxIdx = activeDays.indexOf(Math.max(...activeDays));

    return members.map((m, i) => ({
      memberId: m.id,
      email: m.email,
      shareAmount: toRupiah(rawCents[i] + (i === maxIdx ? remainder : 0)),
    }));
  }

  // ─── PURE FUNCTIONS (used in unit tests directly) ─────────────────────────

  /** Pure: equal split with remainder to first */
  static equalSplit(
    totalCostCents: number,
    count: number,
  ): number[] {
    if (count === 0) return [];
    const base = Math.floor(totalCostCents / count);
    const remainder = totalCostCents - base * count;
    return Array.from({ length: count }, (_, i) =>
      base + (i === 0 ? remainder : 0),
    );
  }

  /** Pure: custom percent split */
  static percentSplit(
    totalCostCents: number,
    percentages: number[],
  ): number[] {
    const total = percentages.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 0.01)
      throw new Error(`Total percent ${total} ≠ 100`);

    const raw = percentages.map((p) => Math.floor((totalCostCents * p) / 100));
    const remainder = totalCostCents - raw.reduce((a, b) => a + b, 0);
    const maxIdx = percentages.indexOf(Math.max(...percentages));
    return raw.map((v, i) => v + (i === maxIdx ? remainder : 0));
  }

  /** Pure: pro-rata split by active days */
  static proRataSplit(
    totalCostCents: number,
    activeDays: number[],
  ): number[] {
    const totalDays = activeDays.reduce((a, b) => a + b, 0);
    const raw = activeDays.map((d) =>
      Math.floor((totalCostCents * d) / totalDays),
    );
    const remainder = totalCostCents - raw.reduce((a, b) => a + b, 0);
    const maxIdx = activeDays.indexOf(Math.max(...activeDays));
    return raw.map((v, i) => v + (i === maxIdx ? remainder : 0));
  }

  // ─── VALIDATION HELPER ────────────────────────────────────────────────────

  /**
   * Validate that adding a new member won't break the split constraint.
   * Returns the recalculated amount for the new member if EQUAL.
   */
  validateBeforeAdd(
    group: GroupEntity,
    currentMemberCount: number,
    newShareAmount?: number,
    newSharePercentage?: number,
  ): void {
    const totalCostCents = Math.round(parseFloat(group.totalAmount) * 100);

    if (group.splitMethod === SplitMethod.CUSTOM_NOMINAL && newShareAmount !== undefined) {
      // Will be validated in full after add — just quick check here
      if (Math.round(newShareAmount * 100) > totalCostCents) {
        throw new BadRequestException({
          code: ErrorCode.SPLIT_AMOUNT_MISMATCH,
          message: 'Share amount melebihi total biaya grup',
        });
      }
    }

    if (group.splitMethod === SplitMethod.CUSTOM_PERCENTAGE && newSharePercentage !== undefined) {
      if (newSharePercentage > 100 || newSharePercentage < 0) {
        throw new BadRequestException({
          code: ErrorCode.SPLIT_AMOUNT_MISMATCH,
          message: 'Persentase harus antara 0 dan 100',
        });
      }
    }
  }

  // ─── INVARIANT CHECK ──────────────────────────────────────────────────────

  /**
   * CRITICAL: Sum of all shares MUST equal totalCost.
   * Throws if violated — this is a programming error, not user error.
   */
  assertInvariant(totalCostCents: number, sharesCents: number[]): void {
    const sumCents = sharesCents.reduce((a, b) => a + b, 0);
    if (sumCents !== totalCostCents) {
      throw new Error(
        `[SPLIT INVARIANT VIOLATION] sum(shares)=${sumCents} ≠ totalCost=${totalCostCents}`,
      );
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Convert cents back to Rupiah (2 decimal places as number) */
function toRupiah(cents: number): number {
  return Math.round(cents) / 100;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(
    1,
    Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)),
  );
}
