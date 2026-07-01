// src/modules/members/dto/add-member.dto.ts
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { NotificationPreference } from '../../../database/entities/enums.js';

export class AddMemberDto {
  /** Email anggota (wajib) */
  @IsEmail({}, { message: 'Email tidak valid' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  displayName!: string;

  /**
   * Nominal bagian tagihan (Rupiah).
   * Untuk SplitMethod.EQUAL: opsional, dihitung otomatis.
   * Untuk CUSTOM_NOMINAL: wajib.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shareAmount?: number;

  /**
   * Persentase bagian tagihan (0–100).
   * Untuk CUSTOM_PERCENTAGE: wajib.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  sharePercentage?: number;

  @IsOptional()
  @IsEnum(NotificationPreference)
  notificationPreference?: NotificationPreference;
}
