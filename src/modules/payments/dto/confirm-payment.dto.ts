import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmPaymentDto {
  @ApiProperty({
    description: 'Signed URL token dari email notification',
    example: 'eyJyZWNvcmRJZCI6IjEyMyIsImV4cGlyZXNBdCI6MTcyMH0.abc123def',
  })
  @IsNotEmpty()
  @IsString()
  token!: string;
}
