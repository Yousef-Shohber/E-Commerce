import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DASHBOARD_STATS_CACHE_KEY,
  DASHBOARD_STATS_CACHE_TTL_SECONDS,
} from '../common/cache';
import { LOW_STOCK_THRESHOLD } from '../common/constants';
import { OrderStatus } from '../common/enums';
import { RedisService } from '../common/redis';
import { OrderItem } from '../orders/order-item.entity';
import { Order } from '../orders/orders.entity';
import { Product } from '../products/products.entity';
import { Review } from '../reviews/reviews.entity';
import { User } from '../users/users.entity';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';

/** An order counts as a sale once it is paid (and stays one until delivered) */
const SALE_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

const TOP_PRODUCTS = 5;
const RECENT_DAYS = 30;

const money = (value: string | number | null | undefined): number =>
  Math.round(Number(value ?? 0) * 100) / 100;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
    @InjectRepository(Review)
    private readonly reviewsRepo: Repository<Review>,
    private readonly redis: RedisService,
  ) {}

  /**
   * Returns the dashboard statistics of the whole shop (admin).
   * The result is cached in Redis for a short time; orders, products, reviews
   * and users invalidate it when they change. If Redis is down, the numbers
   * are computed from the database instead of failing the request.
   * @returns Dashboard statistics.
   */
  async getDashboard(): Promise<DashboardStatsDto> {
    try {
      const cached = await this.redis.getJson<DashboardStatsDto>(
        DASHBOARD_STATS_CACHE_KEY,
      );
      if (cached) return cached;
    } catch (error) {
      this.logger.warn(
        `Dashboard cache read failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const stats = await this.computeStats();

    try {
      await this.redis.setJson(
        DASHBOARD_STATS_CACHE_KEY,
        stats,
        DASHBOARD_STATS_CACHE_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `Dashboard cache write failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return stats;
  }

  private async computeStats(): Promise<DashboardStatsDto> {
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);

    const userStats = await this.usersRepo
      .createQueryBuilder('u')
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE u."createdAt" >= :since)', 'recent')
      .setParameter('since', since)
      .getRawOne<{ total: string; recent: string }>();

    const productStats = await this.productsRepo
      .createQueryBuilder('product')
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE product.stock = 0)', 'outOfStock')
      .addSelect(
        'COUNT(*) FILTER (WHERE product.stock > 0 AND product.stock <= :low)',
        'lowStock',
      )
      .setParameter('low', LOW_STOCK_THRESHOLD)
      .getRawOne<{ total: string; outOfStock: string; lowStock: string }>();

    const statusRows = await this.ordersRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('o.status')
      .getRawMany<{ status: OrderStatus; count: string }>();
    const byStatus = new Map(statusRows.map((r) => [r.status, Number(r.count)]));
    const ordersByStatus = Object.values(OrderStatus).map((status) => ({
      status,
      count: byStatus.get(status) ?? 0,
    }));
    const totalOrders = ordersByStatus.reduce((sum, r) => sum + r.count, 0);

    const salesStats = await this.ordersRepo
      .createQueryBuilder('o')
      .select('COUNT(*)', 'sales')
      .addSelect('COALESCE(SUM(o."totalPrice"), 0)', 'revenue')
      .addSelect(
        'COALESCE(SUM(o."totalPrice") FILTER (WHERE o."createdAt" >= :since), 0)',
        'recentRevenue',
      )
      .addSelect('COALESCE(SUM(o."discountAmount"), 0)', 'discounts')
      .where('o.status IN (:...sale)', { sale: SALE_STATUSES })
      .setParameter('since', since)
      .getRawOne<{
        sales: string;
        revenue: string;
        recentRevenue: string;
        discounts: string;
      }>();

    const topRows = await this.orderItemsRepo
      .createQueryBuilder('item')
      .innerJoin('item.order', 'o')
      .select('item."productId"', 'productId')
      .addSelect('item."productTitle"', 'title')
      .addSelect('SUM(item.quantity)', 'unitsSold')
      .addSelect('SUM(item.quantity * item."unitPrice")', 'revenue')
      .where('o.status IN (:...sale)', { sale: SALE_STATUSES })
      .groupBy('item."productId"')
      .addGroupBy('item."productTitle"')
      .orderBy('"unitsSold"', 'DESC')
      .addOrderBy('"title"', 'ASC')
      .limit(TOP_PRODUCTS)
      .getRawMany<{
        productId: number | null;
        title: string;
        unitsSold: string;
        revenue: string;
      }>();

    const reviewStats = await this.reviewsRepo
      .createQueryBuilder('review')
      .select('COUNT(*)', 'total')
      .addSelect('AVG(review.rating)', 'average')
      .getRawOne<{ total: string; average: string | null }>();

    const sales = Number(salesStats?.sales ?? 0);
    const totalRevenue = money(salesStats?.revenue);

    return {
      totalUsers: Number(userStats?.total ?? 0),
      newUsersLast30Days: Number(userStats?.recent ?? 0),
      totalProducts: Number(productStats?.total ?? 0),
      outOfStockProducts: Number(productStats?.outOfStock ?? 0),
      lowStockProducts: Number(productStats?.lowStock ?? 0),
      totalOrders,
      ordersByStatus,
      totalRevenue,
      revenueLast30Days: money(salesStats?.recentRevenue),
      averageOrderValue: sales > 0 ? money(totalRevenue / sales) : 0,
      totalDiscountGiven: money(salesStats?.discounts),
      topSellingProducts: topRows.map((row) => ({
        productId: row.productId,
        title: row.title,
        unitsSold: Number(row.unitsSold),
        revenue: money(row.revenue),
      })),
      totalReviews: Number(reviewStats?.total ?? 0),
      averageRating: money(reviewStats?.average),
    };
  }
}
