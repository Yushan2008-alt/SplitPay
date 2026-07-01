import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRepository } from '../../../database/repositories/index.js';
import { ErrorCode } from '../../../common/constants/error-codes.js';
import { RedisService } from '../redis.service.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    config: ConfigService,
    private readonly userRepo: UserRepository,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    try {
      const blacklisted = await this.redisService.get(`blacklist:jti:${payload.jti}`);
      if (blacklisted) {
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHORIZED,
          message: 'Token telah dinonaktifkan',
        });
      }
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) throw err;
      /* ponytail: Redis fail-open — when Redis is down we skip blacklist
         check to avoid full auth outage. Upgrade path: add a circuit-breaker
         or a local deny-list for recently-revoked tokens. */
      this.logger.warn(`Redis unreachable, skipping blacklist check: ${(err as Error).message}`);
    }

    const user = await this.userRepo.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Autentikasi diperlukan',
      });
    }

    return payload;
  }
}
