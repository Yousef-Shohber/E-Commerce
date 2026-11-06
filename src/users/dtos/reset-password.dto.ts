import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class ResetUserPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Password Is Required' })
  @MinLength(6)
  @MaxLength(72)
  newPassword: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  userId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(128)
  resetPasswordToken: string;
}
