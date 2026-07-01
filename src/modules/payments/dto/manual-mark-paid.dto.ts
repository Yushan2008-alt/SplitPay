import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ManualMarkPaidDto {
  @ApiProperty({
    description: 'Metode pembayaran (optional)',
    example: 'BCA Transfer',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentMethod?: string;

  @ApiProperty({
    description: 'Catatan pembayaran (optional)',
    example: 'Sudah transfer ke rekening host',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentNote?: string;
}
