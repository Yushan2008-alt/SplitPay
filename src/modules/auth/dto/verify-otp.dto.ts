// src/modules/auth/dto/verify-otp.dto.ts
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Email tidak valid' })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP harus 6 digit' })
  @Matches(/^\d{6}$/, { message: 'OTP harus berupa angka 6 digit' })
  otp!: string;
}
