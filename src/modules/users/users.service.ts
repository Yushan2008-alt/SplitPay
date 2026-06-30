import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserEntity } from '../../database/entities/index.js';
import { UserRepository } from '../../database/repositories/index.js';
import { ErrorCode } from '../../common/constants/error-codes.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
  ) {}

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findById(id);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepo.findByEmail(email);
  }

  async create(email: string, name: string, phone?: string): Promise<UserEntity> {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.MEMBER_ALREADY_EXISTS,
        message: 'Email sudah terdaftar',
      });
    }

    return this.userRepo.createEntity({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      phone: phone?.trim() ?? null,
    });
  }

  async update(
    id: string,
    data: { name?: string; phone?: string | null },
  ): Promise<UserEntity> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() ?? null;

    return this.userRepo.update(id, updateData);
  }

  async markEmailVerified(id: string): Promise<void> {
    await this.userRepo.markEmailVerified(id);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepo.updateLastLogin(id);
  }
}
