import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 2-part base64url signed token: payload.signature */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class ConfirmPaymentDto {
  @ApiProperty({
    description: 'Signed URL token dari email notification',
    example: 'eyJyZWNvcmRJZCI6IjEyMyIsImV4cGlyZXNBdCI6MTcyMH0.abc123def',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(TOKEN_FORMAT, { message: 'Format token tidak valid' })
  token!: string;
}
