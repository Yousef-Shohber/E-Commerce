import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteProductImageDto {
  @ApiProperty({
    description: 'publicId of the image (see `images` of the product)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  publicId: string;
}
