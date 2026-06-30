// src/modules/auth/dto/logout.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
