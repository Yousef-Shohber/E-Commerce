import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Order } from './orders.entity';
import { OrderItem } from './order-item.entity';
import { CheckoutDto } from './dtos/checkout.dto';
import { AdminOrdersQueryDto, OrdersQueryDto } from './dtos/orders-query.dto';
import { OrderStatus, UserType } from '../utils/enums';
import { rowsOf } from '../utils/db-errors';
import { JwtPayloadType } from '../utils/types';

/**
 * Allowed status changes:
 * pending -> paid | cancelled, paid -> shipped | cancelled, shipped -> delivered
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Checkout: turn the cart into an order.
   * Everything happens in one transaction:
   *  1. the cart rows are taken with DELETE ... RETURNING (a double click or
   *     two parallel requests can only get them once),
   *  2. stock is reduced with `stock = stock - n WHERE stock >= n`, so two
   *     buyers can never take the last item,
   *  3. the order and its items are saved with a copy of title and price.
   * If any step fails, the whole thing is rolled back (cart included).
   */
  public async checkout(userId: number, dto: CheckoutDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const cart = rowsOf<{ productId: number; quantity: number }>(
        await manager.query(
          `DELETE FROM cart_items WHERE "userId" = $1 RETURNING "productId", "quantity"`,
          [userId],
        ),
      );

      if (cart.length === 0) {
        throw new BadRequestException('Your cart is empty');
      }

      // always lock products in the same order to avoid deadlocks
      cart.sort((a, b) => a.productId - b.productId);

      const lines: {
        productId: number;
        title: string;
        priceCents: number;
        quantity: number;
      }[] = [];

      for (const row of cart) {
        const updated = rowsOf<{ id: number; title: string; price: number }>(
          await manager.query(
            `UPDATE products SET "stock" = "stock" - $1, "updatedAt" = now()
             WHERE "id" = $2 AND "stock" >= $1
             RETURNING "id", "title", "price"`,
            [row.quantity, row.productId],
          ),
        );

        if (updated.length === 0) {
          const product = rowsOf<{ title: string }>(
            await manager.query(
              `SELECT "title" FROM products WHERE "id" = $1`,
              [row.productId],
            ),
          )[0];

          if (!product) {
            throw new BadRequestException(
              'A product in your cart is no longer available',
            );
          }
          throw new ConflictException(
            `Not enough stock for "${product.title}"`,
          );
        }

        lines.push({
          productId: updated[0].id,
          title: updated[0].title,
          priceCents: Math.round(updated[0].price * 100),
          quantity: row.quantity,
        });
      }

      const totalCents = lines.reduce(
        (sum, line) => sum + line.priceCents * line.quantity,
        0,
      );

      const order = await manager.save(
        manager.create(Order, {
          userId,
          status: OrderStatus.PENDING,
          totalPrice: totalCents / 100,
          shippingAddress: dto.shippingAddress,
        }),
      );

      await manager.save(
        lines.map((line) =>
          manager.create(OrderItem, {
            orderId: order.id,
            productId: line.productId,
            productTitle: line.title,
            unitPrice: line.priceCents / 100,
            quantity: line.quantity,
          }),
        ),
      );

      return manager.findOneOrFail(Order, { where: { id: order.id } });
    });
  }

  /**
   * Orders Of The Logged In User
   */
  public async getMyOrders(userId: number, query: OrdersQueryDto) {
    return this.list({ userId, status: query.status }, query);
  }

  /**
   * All Orders (Admin)
   */
  public async getAllOrders(query: AdminOrdersQueryDto) {
    return this.list({ userId: query.userId, status: query.status }, query);
  }

  /**
   * Get Single Order (the owner or an admin)
   */
  public async getOneBy(id: number, payload: JwtPayloadType) {
    const order = await this.findOrFail(id);
    this.assertOwnerOrAdmin(order, payload);
    return order;
  }

  /**
   * Cancel An Order (the owner or an admin) and give the stock back.
   * The status change is a compare-and-set, so cancelling twice (or from two
   * places at the same time) gives the stock back only once.
   */
  public async cancel(id: number, payload: JwtPayloadType): Promise<Order> {
    const order = await this.findOrFail(id);
    this.assertOwnerOrAdmin(order, payload);

    return this.dataSource.transaction((manager) =>
      this.cancelInTransaction(manager, id),
    );
  }

  /**
   * Change The Status Of An Order (Admin)
   */
  public async updateStatus(id: number, status: OrderStatus): Promise<Order> {
    await this.findOrFail(id);

    if (status === OrderStatus.CANCELLED) {
      return this.dataSource.transaction((manager) =>
        this.cancelInTransaction(manager, id),
      );
    }

    const allowedFrom = (Object.keys(TRANSITIONS) as OrderStatus[]).filter(
      (from) => TRANSITIONS[from].includes(status),
    );

    const result = await this.ordersRepository
      .createQueryBuilder()
      .update(Order)
      .set({ status })
      .where('id = :id', { id })
      .andWhere('status IN (:...allowedFrom)', { allowedFrom })
      .execute();

    if (!result.affected) {
      const current = await this.findOrFail(id);
      throw new ConflictException(
        `Order cannot go from "${current.status}" to "${status}"`,
      );
    }

    return this.findOrFail(id);
  }

  // Helpers

  private async cancelInTransaction(manager: EntityManager, id: number) {
    const cancelled = await manager
      .createQueryBuilder()
      .update(Order)
      .set({ status: OrderStatus.CANCELLED })
      .where('id = :id', { id })
      .andWhere('status IN (:...from)', {
        from: [OrderStatus.PENDING, OrderStatus.PAID],
      })
      .execute();

    if (!cancelled.affected) {
      const current = await manager.findOneOrFail(Order, { where: { id } });
      throw new ConflictException(
        `Order cannot be cancelled, it is already "${current.status}"`,
      );
    }

    const items = rowsOf<{ productId: number; quantity: number }>(
      await manager.query(
        `SELECT "productId", "quantity" FROM order_items
         WHERE "orderId" = $1 AND "productId" IS NOT NULL
         ORDER BY "productId"`,
        [id],
      ),
    );

    for (const item of items) {
      await manager.query(
        `UPDATE products SET "stock" = "stock" + $1, "updatedAt" = now()
         WHERE "id" = $2`,
        [item.quantity, item.productId],
      );
    }

    return manager.findOneOrFail(Order, { where: { id } });
  }

  private async list(
    filter: { userId?: number; status?: OrderStatus },
    query: OrdersQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const [items, total] = await this.ordersRepository.findAndCount({
      where: {
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
  }

  private async findOrFail(id: number) {
    const order = await this.ordersRepository.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    return order;
  }

  private assertOwnerOrAdmin(order: Order, payload: JwtPayloadType) {
    if (
      order.userId !== payload.id &&
      (payload.userType as UserType) !== UserType.ADMIN
    ) {
      throw new ForbiddenException('Access Denied, You Are Not Allowed');
    }
  }
}
