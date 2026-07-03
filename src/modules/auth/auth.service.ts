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
import { generateOTP } from '../../common/utils/crypto.util.js';
import { ErrorCode } from '../../common/constants/error-codes.js';
import { UserEntity } from '../../database/entities/index.js';
import { MemberRole } from '../../database/entities/enums.js';
import {
  GroupRepository,
  OtpCodeRepository,
} from '../../database/repositories/index.js';
import { UsersService } from '../users/users.service.js';
import { MailService } from './mail.service.js';
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
    private readonly mailService: MailService,
    private readonly groupRepo: GroupRepository,
  ) {
    this.otpExpiry = this.config.get<number>('OTP_EXPIRES_IN_SECONDS') ?? 300;
    this.otpMaxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS') ?? 5;
    this.otpCooldown = this.config.get<number>('OTP_COOLDOWN_SECONDS') ?? 60;
  }

  async register(
    dto: { email: string; name: string; phone?: string },
    ip?: string,
    userAgent?: string,
  ) {
    const user = await this.usersService.create(dto.email, dto.name, dto.phone);
    const otp = await this.generateAndStoreOtp(user.email, ip, userAgent);
    return {
      message: 'Registrasi berhasil. Silakan cek email untuk OTP.',
      ...(otp ? { devOtp: otp } : {}),
    };
  }

  async sendOtp(dto: { email: string }, ip?: string, userAgent?: string) {
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
    const otp = await this.generateAndStoreOtp(email, ip, userAgent);
    return {
      message: 'OTP telah dikirim ke email Anda.',
      ...(otp ? { devOtp: otp } : {}),
    };
  }

  async verifyOtp(dto: { email: string; otp: string }, ip?: string) {
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

    await this.otpRepo.incrementAttempts(otpEntity.id);
    otpEntity.attempts += 1;

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

  async refreshToken(
    oldRefreshToken: string,
    payload: JwtPayload,
    ip?: string,
  ) {
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

  async logout(refreshToken: string, payload: JwtPayload, ip?: string) {
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

  async updateProfile(userId: string, dto: { name?: string; phone?: string }) {
    return this.usersService.update(userId, dto);
  }

  private async generateTokens(user: UserEntity) {
    const hostedGroups = await this.groupRepo.findByHostId(user.id);
    const role = hostedGroups.length > 0 ? MemberRole.HOST : MemberRole.PAYER;

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role,
      jti: randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, type: 'access' },
        {
          secret: this.config.get<string>('jwt.accessSecret'),
          // ponytail: @nestjs/jwt v11 uses StringValue branded type — plain `string` won't compile
expiresIn: (this.config.get<string>('jwt.accessExpiresIn') ??
            '15m') as any,
        },
      ),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: this.config.get<string>('jwt.refreshSecret'),
          // ponytail: @nestjs/jwt v11 uses StringValue branded type — plain `string` won't compile
expiresIn: (this.config.get<string>('jwt.refreshExpiresIn') ??
            '7d') as any,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async generateAndStoreOtp(
    email: string,
    ip?: string,
    userAgent?: string,
  ): Promise<string | undefined> {
    const otp = this.generateOtpCode();
    const codeHash = hashSync(otp, 10);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP] ${email}: ${otp}`);
    }

    await this.mailService.sendOtpEmail(email, otp);

    await this.otpRepo.createEntity({
      email,
      codeHash,
      expiresAt: new Date(Date.now() + this.otpExpiry * 1000),
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
    });

    // ponytail: return plain OTP in dev so E2E tests can automate verification
    if (process.env.NODE_ENV !== 'production') {
      return otp;
    }
    return undefined;
  }

  private generateOtpCode(): string {
    return generateOTP(6);
  }

  private async checkCooldown(email: string): Promise<void> {
    const recentOtp = await this.otpRepo.findRecentByEmail(
      email,
      this.otpCooldown,
    );

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
