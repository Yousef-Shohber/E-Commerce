import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { VerifyEmailDto } from './verify-email.dto';

export class ResetPasswordDto extends VerifyEmailDto {
  @ApiProperty({ minLength: 6, maxLength: 72 })
  @IsString()
  @IsNotEmpty({ message: 'Password Is Required' })
  @MinLength(6)
  @MaxLength(72)
  newPassword: string;
}
