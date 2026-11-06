import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ example: '12 Nile St, Mansoura, Egypt' })
  @IsString()
  @IsNotEmpty({ message: 'Shipping address is required' })
  @Length(5, 500)
  shippingAddress: string;
}
