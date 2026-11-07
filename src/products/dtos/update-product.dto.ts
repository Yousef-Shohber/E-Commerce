import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  IsNumber,
  Min,
  IsInt,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsString()
  @Length(2, 50)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0, { message: 'Price must be a positive number' })
  @IsOptional()
  price?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiPropertyOptional({
    description: 'Category id (send null to remove the category)',
    nullable: true,
  })
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  @Min(1)
  @IsOptional()
  categoryId?: number | null;
}
