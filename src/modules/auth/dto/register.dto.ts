import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email tidak valid' })
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email!: string;

@IsString()
@IsNotEmpty()
@Length(1, 100, { message: 'Nama harus antara 1-100 karakter' })
@Transform(({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.trim().replace(/<[^>]*>/g, '').replace(/[<>]/g, '')
    : value,
)
name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+62|0)8\d{7,11}$/, {
    message: 'Nomor telepon harus diawali +62 atau 08 (10-15 digit)',
  })
  phone?: string;
}
