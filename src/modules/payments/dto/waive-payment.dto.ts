import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WaivePaymentDto {
  @ApiProperty({ description: 'Alasan pembebasan pembayaran', example: 'Member keluar dari grup', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
