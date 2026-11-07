import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CouponType } from '../../common/enums';
import { NormalizeCode } from '../../common/transforms';

const money = { maxDecimalPlaces: 2 };

export class CreateCouponDto {
  @ApiProperty({ example: 'SAVE10', description: 'Letters, numbers, - and _' })
  @NormalizeCode()
  @Matches(/^[A-Z0-9_-]{3,50}$/, {
    message: 'code must be 3-50 letters, numbers, "-" or "_"',
  })
  code: string;

  @ApiProperty({ enum: CouponType })
  @IsEnum(CouponType)
  type: CouponType;

  @ApiProperty({
    example: 10,
    description: 'Percentage (1-100) or amount, depending on the type',
  })
  @IsNumber(money)
  @Min(0.01)
  @Max(1_000_000)
  value: number;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber(money)
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  minOrderAmount?: number;

  @ApiPropertyOptional({ description: 'Upper limit of the discount' })
  @IsNumber(money)
  @Min(0.01)
  @Max(1_000_000_000)
  @IsOptional()
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startsAt?: Date;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  expiresAt?: Date;

  @ApiPropertyOptional({
    description: 'Total number of orders that can use it',
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @IsOptional()
  usageLimit?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
