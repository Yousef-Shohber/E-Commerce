import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class AddToCartDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  productId: number;

  @ApiProperty({ minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
