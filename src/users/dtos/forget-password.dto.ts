import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../common/transforms';

export class ForgetPasswordDto {
  @ApiProperty()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(250)
  @IsNotEmpty({ message: 'Email Is Required' })
  email: string;
}
