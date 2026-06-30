// src/common/guards/roles.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { MemberRole } from '../../database/entities/enums.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { ErrorCode } from '../constants/error-codes.js';
import type { JwtPayload } from '../decorators/current-user.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MemberRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator → allow all authenticated users
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Akses ditolak',
      });
    }

    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_HOST,
        message: 'Aksi ini hanya bisa dilakukan oleh host',
      });
    }

    return true;
  }
}
