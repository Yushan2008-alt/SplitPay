import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

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
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Nomor telepon maksimal 20 karakter' })
  phone?: string;
}
