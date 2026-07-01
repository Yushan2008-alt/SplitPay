import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GroupMemberEntity } from '../entities/group-member.entity.js';
import { MemberStatus } from '../entities/enums.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class GroupMemberRepository extends BaseRepository<GroupMemberEntity> {
  constructor(
    @InjectRepository(GroupMemberEntity)
    repo: Repository<GroupMemberEntity>,
  ) {
    super(repo);
  }

  async findByGroupId(groupId: string): Promise<GroupMemberEntity[]> {
    return this.repo.find({
      where: { groupId },
      order: { joinedAt: 'ASC' },
    });
  }

  async findByUserId(userId: string): Promise<GroupMemberEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { joinedAt: 'DESC' },
    });
  }

  async findByEmail(email: string): Promise<GroupMemberEntity[]> {
    return this.repo.find({
      where: { email: email.toLowerCase().trim() },
      order: { joinedAt: 'DESC' },
    });
  }

  async findByGroupAndEmail(
    groupId: string,
    email: string,
  ): Promise<GroupMemberEntity | null> {
    return this.repo.findOne({
      where: { groupId, email: email.toLowerCase().trim(), status: MemberStatus.ACTIVE },
    });
  }

  async findByGroupAndUser(
    groupId: string,
    userId: string,
  ): Promise<GroupMemberEntity | null> {
    return this.repo.findOne({ where: { groupId, userId } });
  }

  async findActiveByGroup(groupId: string): Promise<GroupMemberEntity[]> {
    return this.repo.find({
      where: { groupId, status: MemberStatus.ACTIVE },
      order: { joinedAt: 'ASC' },
    });
  }

  async countActiveByGroup(groupId: string): Promise<number> {
    return this.repo.count({
      where: { groupId, status: MemberStatus.ACTIVE },
    });
  }

  async findMembersByGroupIds(groupIds: string[]): Promise<GroupMemberEntity[]> {
    return this.repo.find({
      where: { groupId: In(groupIds), status: MemberStatus.ACTIVE },
      order: { joinedAt: 'ASC' },
    });
  }
}
