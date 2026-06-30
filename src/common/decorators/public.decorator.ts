// src/common/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() — bypass JwtAuthGuard for open endpoints (e.g. /auth/login)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
