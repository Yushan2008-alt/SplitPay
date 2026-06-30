// src/common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '../../database/entities/enums.js';

export const ROLES_KEY = 'roles';

/**
 * @Roles(MemberRole.HOST) — restrict route to specific roles
 */
export const Roles = (...roles: MemberRole[]) => SetMetadata(ROLES_KEY, roles);
