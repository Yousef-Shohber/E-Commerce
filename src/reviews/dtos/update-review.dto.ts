import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  MaxLength,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateReviewDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  @IsOptional()
  comment?: string;
}
