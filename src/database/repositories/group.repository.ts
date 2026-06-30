import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupEntity } from '../entities/group.entity.js';
import { GroupStatus } from '../entities/enums.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class GroupRepository extends BaseRepository<GroupEntity> {
  constructor(
    @InjectRepository(GroupEntity)
    repo: Repository<GroupEntity>,
  ) {
    super(repo);
  }

  async findByHostId(hostId: string): Promise<GroupEntity[]> {
    return this.repo.find({
      where: { hostId },
      order: { createdAt: 'DESC' },
    });
  }

  async findActive(): Promise<GroupEntity[]> {
    return this.repo.find({
      where: { status: GroupStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  async findByName(name: string): Promise<GroupEntity[]> {
    return this.repo.find({
      where: { name },
      order: { createdAt: 'DESC' },
    });
  }
}
