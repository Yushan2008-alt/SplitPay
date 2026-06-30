import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100, { message: 'Nama harus antara 1-100 karakter' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Nomor telepon maksimal 20 karakter' })
  phone?: string;
}
