import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../utils/transforms';

export class RegisterDto {
  @ApiProperty()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(250)
  @IsNotEmpty({ message: 'Email Is Required' })
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Password Is Required' })
  @MinLength(6)
  @MaxLength(72)
  password: string;

  @ApiPropertyOptional()
  @IsString()
  @Length(2, 150)
  @IsOptional()
  username?: string;
}
