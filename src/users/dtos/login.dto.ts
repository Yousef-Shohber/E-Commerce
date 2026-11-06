import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../utils/transforms';

export class LoginDto {
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
}
