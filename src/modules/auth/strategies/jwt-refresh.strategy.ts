// src/modules/auth/strategies/jwt-refresh.strategy.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCode } from '../../../common/constants/error-codes.js';
import { RedisService } from '../redis.service.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';

export interface RequestWithRefreshToken extends Request {
  user: JwtPayload;
  refreshToken: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  private readonly logger = new Logger(JwtRefreshStrategy.name);

  constructor(
    config: ConfigService,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload,
  ): Promise<JwtPayload & { refreshToken: string }> {
    try {
      const blacklisted = await this.redisService.get(
        `blacklist:jti:${payload.jti}`,
      );
      if (blacklisted) {
        throw new UnauthorizedException({
          code: ErrorCode.TOKEN_REVOKED,
          message: 'Refresh token telah dinonaktifkan',
        });
      }
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) throw err;
      /* ponytail: Redis fail-open — when Redis is down we skip blacklist
         check to avoid full auth outage. Upgrade path: add a circuit-breaker
         or a local deny-list for recently-revoked tokens. */
      this.logger.warn(
        `Redis unreachable, skipping refresh blacklist check: ${(err as Error).message}`,
      );
    }

    const body = req.body as Record<string, unknown>;
    const refreshToken = body['refreshToken'] as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Refresh token tidak ditemukan',
      });
    }
    return { ...payload, refreshToken };
  }
}
