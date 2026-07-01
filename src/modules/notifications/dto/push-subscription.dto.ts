import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubscribePushDto {
  @ApiProperty({
    description: 'Push subscription endpoint URL from browser Push API',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  @IsNotEmpty()
  @IsUrl()
  endpoint: string;

  @ApiProperty({
    description: 'P256DH key from browser subscription',
    example: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ...',
  })
  @IsNotEmpty()
  @IsString()
  p256dh: string;

  @ApiProperty({
    description: 'Auth secret from browser subscription',
    example: 'tBHItJI5svbpez7KI4CCXg',
  })
  @IsNotEmpty()
  @IsString()
  auth: string;

  @ApiProperty({
    description: 'User agent string (optional)',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class UnsubscribePushDto {
  @ApiProperty({
    description: 'Push subscription endpoint to unsubscribe',
    example: 'https://fcm.googleapis.com/fcm/send/abc123',
  })
  @IsNotEmpty()
  @IsUrl()
  endpoint: string;
}
