import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { OrderStatus } from '../../common/enums';

export class OrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;
}

export class AdminOrdersQueryDto extends OrdersQueryDto {
  @ApiPropertyOptional({ description: 'Only orders of this user' })
  @IsUUID()
  @IsOptional()
  userId?: string;
}
