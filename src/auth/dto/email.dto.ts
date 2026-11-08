import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../common/transforms';

export class EmailDto {
  @ApiProperty({ example: 'user@gmail.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(250)
  @IsNotEmpty({ message: 'Email Is Required' })
  email: string;
}
