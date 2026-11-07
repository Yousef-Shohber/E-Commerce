import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { NormalizeCode } from '../../common/transforms';

export class CheckoutDto {
  @ApiProperty({ example: '12 Nile St, Mansoura, Egypt' })
  @IsString()
  @IsNotEmpty({ message: 'Shipping address is required' })
  @Length(5, 500)
  shippingAddress: string;

  @ApiPropertyOptional({ example: 'SAVE10' })
  @NormalizeCode()
  @IsString()
  @Length(3, 50)
  @IsOptional()
  couponCode?: string;
}
