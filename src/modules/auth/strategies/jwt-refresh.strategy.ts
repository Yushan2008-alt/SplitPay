// src/modules/auth/strategies/jwt-refresh.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ErrorCode } from '../../../common/constants/error-codes.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';

// Augment Request to carry refreshToken for downstream use
export interface RequestWithRefreshToken extends Request {
  user: JwtPayload;
  refreshToken: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): JwtPayload & { refreshToken: string } {
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
