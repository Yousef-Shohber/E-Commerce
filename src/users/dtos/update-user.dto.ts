import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty({ message: 'Password Is Required' })
  @MinLength(6)
  @MaxLength(72)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional()
  @IsString()
  @Length(2, 150)
  @IsOptional()
  username?: string;
}
