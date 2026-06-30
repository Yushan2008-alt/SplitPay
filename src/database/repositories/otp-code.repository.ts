import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { OtpCodeEntity } from '../entities/otp-code.entity.js';
import { BaseRepository } from './base.repository.js';

@Injectable()
export class OtpCodeRepository extends BaseRepository<OtpCodeEntity> {
  constructor(
    @InjectRepository(OtpCodeEntity)
    repo: Repository<OtpCodeEntity>,
  ) {
    super(repo);
  }

  async findLatestByEmail(email: string): Promise<OtpCodeEntity | null> {
    return this.repo.findOne({
      where: { email: email.toLowerCase().trim() },
      order: { createdAt: 'DESC' },
    });
  }

  async findValidByEmail(email: string): Promise<OtpCodeEntity | null> {
    return this.repo.findOne({
      where: {
        email: email.toLowerCase().trim(),
        isUsed: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findRecentByEmail(
    email: string,
    cooldownSeconds: number,
  ): Promise<OtpCodeEntity | null> {
    return this.repo.findOne({
      where: {
        email: email.toLowerCase().trim(),
        createdAt: MoreThan(new Date(Date.now() - cooldownSeconds * 1000)),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async invalidatePreviousCodes(email: string): Promise<void> {
    await this.repo.update(
      { email: email.toLowerCase().trim(), isUsed: false },
      { isUsed: true },
    );
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.repo.increment({ id }, 'attempts', 1);
  }

  async cleanExpired(): Promise<number> {
    const result = await this.repo.delete({
      expiresAt: LessThan(new Date()),
      isUsed: true,
    });
    return result.affected ?? 0;
  }
}
