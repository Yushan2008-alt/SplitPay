// src/modules/auth/interfaces/jwt-payload.interface.ts
import type { MemberRole } from '../../../database/entities/enums.js';

export interface JwtPayload {
  sub: string;     // userId (UUID)
  email: string;
  role: MemberRole;
  jti: string;     // JWT ID — used for blacklisting on logout
  iat?: number;
  exp?: number;
}
