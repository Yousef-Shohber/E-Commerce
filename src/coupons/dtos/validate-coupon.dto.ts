import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { NormalizeCode } from '../../common/transforms';

export class ValidateCouponDto {
  @ApiProperty({ example: 'SAVE10' })
  @NormalizeCode()
  @IsString()
  @Length(3, 50)
  code: string;
}
