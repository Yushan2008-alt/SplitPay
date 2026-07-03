import {
  BadRequestException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(AuthService.name);
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
    this.logger.log(`User registered: ${this.maskEmail(user.email)}`);
    return {
      message: 'Registrasi berhasil. Silakan cek email untuk OTP.',
      ...(otp ? { devOtp: otp } : {}),
    };
  }

  async sendOtp(dto: { email: string }, ip?: string, userAgent?: string) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // ponytail: don't leak whether email exists — always return same message
      this.logger.warn(`OTP requested for unknown email: ${this.maskEmail(email)}`);
      return { message: 'Jika email terdaftar, OTP telah dikirim.' };
    }

    await this.checkCooldown(email);
    await this.invalidateOldOtps(email);
    const otp = await this.generateAndStoreOtp(email, ip, userAgent);
    this.logger.log(`OTP sent to ${this.maskEmail(email)}`);
    return {
      message: 'Jika email terdaftar, OTP telah dikirim.',
      ...(otp ? { devOtp: otp } : {}),
    };
  }

  async verifyOtp(dto: { email: string; otp: string }, ip?: string) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // ponytail: don't leak whether email exists — return generic OTP error
      this.logger.warn(`OTP verification failed — unknown email: ${this.maskEmail(email)}`);
      throw new BadRequestException({
        code: ErrorCode.INVALID_OTP,
        message: 'OTP tidak valid',
      });
    }

    const otpEntity = await this.otpRepo.findValidByEmail(email);

    if (!otpEntity) {
      // ponytail: don't leak whether OTP expired vs never existed
      this.logger.warn(`OTP verification failed — no valid code for ${this.maskEmail(email)}`);
      throw new BadRequestException({
        code: ErrorCode.INVALID_OTP,
        message: 'OTP tidak valid',
      });
    }

    await this.otpRepo.incrementAttempts(otpEntity.id);
    otpEntity.attempts += 1;

    if (otpEntity.attempts > this.otpMaxAttempts) {
      await this.otpRepo.update(otpEntity.id, { isUsed: true });
      this.logger.warn(`OTP max attempts reached for ${this.maskEmail(email)}`);
      throw new BadRequestException({
        code: ErrorCode.INVALID_OTP,
        message: 'OTP tidak valid.',
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

    this.logger.log(`OTP verified successfully for ${this.maskEmail(email)}`);

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
      this.logger.warn(`Refresh token used for deleted user: ${payload.sub}`);
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Token tidak valid atau kadaluarsa',
      });
    }

    this.logger.log(`Token refreshed for user ${this.maskEmail(user.email)}`);
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

    // ponytail: only log masked email in dev; OTP is returned in response for E2E tests
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV] OTP generated for ${this.maskEmail(email)}`);
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

  // ponytail: mask PII in logs — show first char + domain only
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
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
