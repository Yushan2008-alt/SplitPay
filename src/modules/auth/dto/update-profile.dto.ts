import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100, { message: 'Nama harus antara 1-100 karakter' })
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+62|0)8\d{7,11}$/, {
    message: 'Nomor telepon harus diawali +62 atau 08 (10-15 digit)',
  })
  phone?: string;
}
