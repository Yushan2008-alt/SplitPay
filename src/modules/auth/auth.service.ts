import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compareSync, hashSync } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ErrorCode } from '../../common/constants/error-codes.js';
import { UserEntity } from '../../database/entities/index.js';
import { MemberRole } from '../../database/entities/enums.js';
import { OtpCodeRepository } from '../../database/repositories/index.js';
import { UsersService } from '../users/users.service.js';
import { RedisService } from './redis.service.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

@Injectable()
export class AuthService {
  private readonly otpExpiry: number;
  private readonly otpMaxAttempts: number;
  private readonly otpCooldown: number;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redisService: RedisService,
    private readonly otpRepo: OtpCodeRepository,
  ) {
    this.otpExpiry = this.config.get<number>('OTP_EXPIRES_IN_SECONDS') ?? 300;
    this.otpMaxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS') ?? 5;
    this.otpCooldown = this.config.get<number>('OTP_COOLDOWN_SECONDS') ?? 60;
  }

  async register(dto: { email: string; name: string; phone?: string }) {
    const user = await this.usersService.create(dto.email, dto.name, dto.phone);
    await this.generateAndStoreOtp(user.email);
    return { message: 'Registrasi berhasil. Silakan cek email untuk OTP.' };
  }

  async sendOtp(dto: { email: string }) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'Email tidak terdaftar',
      });
    }

    await this.checkCooldown(email);
    await this.invalidateOldOtps(email);
    await this.generateAndStoreOtp(email);
    return { message: 'OTP telah dikirim ke email Anda.' };
  }

  async verifyOtp(dto: { email: string; otp: string }) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'Email tidak terdaftar',
      });
    }

    const otpEntity = await this.otpRepo.findValidByEmail(email);

    if (!otpEntity) {
      throw new BadRequestException({
        code: ErrorCode.OTP_EXPIRED,
        message: 'OTP telah kadaluarsa. Silakan request OTP baru.',
      });
    }

    otpEntity.attempts += 1;
    await this.otpRepo.update(otpEntity.id, { attempts: otpEntity.attempts });

    if (otpEntity.attempts > this.otpMaxAttempts) {
      await this.otpRepo.update(otpEntity.id, { isUsed: true });
      throw new BadRequestException({
        code: ErrorCode.OTP_MAX_ATTEMPTS,
        message: 'Terlalu banyak percobaan. Silakan request OTP baru.',
      });
    }

    if (!compareSync(dto.otp, otpEntity.codeHash)) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_OTP,
        message: 'OTP tidak valid.',
      });
    }

    await this.otpRepo.update(otpEntity.id, { isUsed: true });

    if (!user.isEmailVerified) {
      await this.usersService.markEmailVerified(user.id);
    }

    await this.usersService.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user);
    return tokens;
  }

  async refreshToken(oldRefreshToken: string, payload: JwtPayload) {
    const blacklistKey = `blacklist:jti:${payload.jti}`;
    const expiresIn = payload.exp
      ? Math.max(1, Math.floor(payload.exp - Date.now() / 1000))
      : 0;
    if (expiresIn > 0) {
      await this.redisService.set(blacklistKey, 'true', expiresIn);
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Autentikasi diperlukan',
      });
    }

    return this.generateTokens(user);
  }

  async logout(refreshToken: string, payload: JwtPayload) {
    const expiresIn = payload.exp
      ? Math.max(1, Math.floor(payload.exp - Date.now() / 1000))
      : 0;
    if (expiresIn > 0) {
      await this.redisService.set(
        `blacklist:jti:${payload.jti}`,
        'true',
        expiresIn,
      );
    }
    return { message: 'Berhasil logout.' };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'Pengguna tidak ditemukan',
      });
    }
    return user;
  }

  async updateProfile(
    userId: string,
    dto: { name?: string; phone?: string },
  ) {
    return this.usersService.update(userId, dto);
  }

  private async generateTokens(user: UserEntity) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: MemberRole.PAYER,
      jti: randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, type: 'access' },
        {
          secret: this.config.get<string>('jwt.accessSecret'),
          expiresIn: (this.config.get<string>('jwt.accessExpiresIn') ?? '15m') as any,
        },
      ),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: this.config.get<string>('jwt.refreshSecret'),
          expiresIn: (this.config.get<string>('jwt.refreshExpiresIn') ?? '7d') as any,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async generateAndStoreOtp(email: string): Promise<void> {
    const otp = this.generateOtpCode();
    const codeHash = hashSync(otp, 10);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP] ${email}: ${otp}`);
    }

    await this.otpRepo.createEntity({
      email,
      codeHash,
      expiresAt: new Date(Date.now() + this.otpExpiry * 1000),
    });
  }

  private generateOtpCode(): string {
    const digits = 6;
    const max = Math.pow(10, digits);
    const code = Math.floor(Math.random() * max);
    return String(code).padStart(digits, '0');
  }

  private async checkCooldown(email: string): Promise<void> {
    const recentOtp = await this.otpRepo.findRecentByEmail(email, this.otpCooldown);

    if (recentOtp) {
      throw new BadRequestException({
        code: ErrorCode.OTP_COOLDOWN,
        message: `Mohon tunggu ${this.otpCooldown} detik sebelum request OTP lagi.`,
      });
    }
  }

  private async invalidateOldOtps(email: string): Promise<void> {
    await this.otpRepo.invalidatePreviousCodes(email);
  }
}
