// src/modules/auth/dto/refresh-token.dto.ts
import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** 3-part base64url JWT: header.payload.signature */
const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @Matches(JWT_REGEX, { message: 'Format refresh token tidak valid' })
  refreshToken!: string;
}
