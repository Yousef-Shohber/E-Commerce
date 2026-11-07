import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

export class ProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'laptop' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'min price' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  minPrice?: number;

  @ApiPropertyOptional({ description: 'max price' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Category id' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @IsOptional()
  categoryId?: number;

  @ApiPropertyOptional({ enum: ['createdAt', 'price', 'title'] })
  @IsIn(['createdAt', 'price', 'title'])
  @IsOptional()
  sortBy?: 'createdAt' | 'price' | 'title' = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsIn(['ASC', 'DESC'])
  @IsOptional()
  order?: 'ASC' | 'DESC' = 'DESC';
}
