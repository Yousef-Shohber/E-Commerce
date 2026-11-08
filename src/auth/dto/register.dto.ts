import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EmailDto } from './email.dto';

export class RegisterDto extends EmailDto {
  @ApiProperty({ minLength: 6, maxLength: 72 })
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
