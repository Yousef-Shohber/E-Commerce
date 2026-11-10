import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../common/enums';

class OrderStatusCountDto {
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty() count: number;
}

class TopProductDto {
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'NULL if the product was deleted after it was sold',
  })
  productId: number | null;

  @ApiProperty() title: string;

  @ApiProperty({ description: 'Units in orders that count as sales' })
  unitsSold: number;

  @ApiProperty({ description: 'Money from those units' }) revenue: number;
}

export class DashboardStatsDto {
  @ApiProperty() totalUsers: number;

  @ApiProperty({ description: 'Users created in the last 30 days' })
  newUsersLast30Days: number;

  @ApiProperty() totalProducts: number;

  @ApiProperty({ description: 'Products with stock 0' })
  outOfStockProducts: number;

  @ApiProperty({ description: 'Products with 1 to 5 units left' })
  lowStockProducts: number;

  @ApiProperty() totalOrders: number;

  @ApiProperty({
    type: [OrderStatusCountDto],
    description: 'Every status is listed, with 0 if there are no orders',
  })
  ordersByStatus: OrderStatusCountDto[];

  @ApiProperty({
    description: 'Sales = orders that are paid, shipped or delivered',
  })
  totalRevenue: number;

  @ApiProperty({ description: 'Same as totalRevenue, last 30 days' })
  revenueLast30Days: number;

  @ApiProperty({ description: 'totalRevenue / number of sales (0 if none)' })
  averageOrderValue: number;

  @ApiProperty({ description: 'Discounts given in the sales' })
  totalDiscountGiven: number;

  @ApiProperty({ type: [TopProductDto], description: 'Top 5 by units sold' })
  topSellingProducts: TopProductDto[];

  @ApiProperty() totalReviews: number;

  @ApiProperty({ description: 'Average rating of all reviews (0 if none)' })
  averageRating: number;
}
