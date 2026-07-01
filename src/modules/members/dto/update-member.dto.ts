// src/modules/members/dto/update-member.dto.ts
import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { NotificationPreference } from '../../../database/entities/enums.js';

export class UpdateMemberDto {
  /** Payer hanya boleh update preferensi notifikasi miliknya sendiri */
  @IsOptional()
  @IsEnum(NotificationPreference)
  notificationPreference?: NotificationPreference;

  /** Host boleh update shareAmount */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shareAmount?: number;

  /** Host boleh update sharePercentage */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  sharePercentage?: number;
}
