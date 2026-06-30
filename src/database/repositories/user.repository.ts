import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class UserRepository extends BaseRepository<UserEntity> {
  constructor(
    @InjectRepository(UserEntity)
    repo: Repository<UserEntity>,
  ) {
    super(repo);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.repo.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findByPhone(phone: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { phone } });
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.repo.update(id, { isEmailVerified: true });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }
}
