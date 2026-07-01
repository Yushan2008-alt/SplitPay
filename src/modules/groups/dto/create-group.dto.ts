// src/modules/groups/dto/create-group.dto.ts
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  BillingFrequency,
  SplitMethod,
} from '../../../database/entities/enums.js';

export class CreateGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  serviceName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Total biaya langganan dalam Rupiah. Min 1000, Max 100_000_000 */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1000)
  @Max(100_000_000)
  totalAmount!: number;

  @IsEnum(BillingFrequency)
  frequency!: BillingFrequency;

  /** Tanggal jatuh tempo bulanan (1–28) */
  @IsInt()
  @Min(1)
  @Max(28)
  dueDay!: number;

  @IsEnum(SplitMethod)
  splitMethod!: SplitMethod;

  /** Hari toleransi setelah jatuh tempo sebelum status OVERDUE */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  gracePeriodDays?: number;
}
