// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface.js';

export type { JwtPayload };

/**
 * @CurrentUser()          → returns full JwtPayload
 * @CurrentUser('sub')     → returns userId string
 * @CurrentUser('email')   → returns email string
 */
export const CurrentUser = createParamDecorator(
  (property: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    const user = request.user;
    return property ? user?.[property] : user;
  },
);
