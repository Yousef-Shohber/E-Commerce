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
import { OrderStatus, UserType } from '../common/enums';
import { Paginated, resolveSort, toSkip } from '../common/pagination';
import { fromCents, rowsOf, toCents } from '../common/utils';
import { User } from '../users/users.entity';
import { CouponsService } from '../coupons/coupons.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { CacheInvalidationService } from '../common/cache';
import { LOW_STOCK_THRESHOLD } from '../common/constants';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';

const ORDER_SORT_FIELDS = ['createdAt', 'totalPrice', 'status'] as const;

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

/** What the customer is told when the status of the order changes */
const STATUS_NOTIFICATIONS: Partial<
  Record<OrderStatus, { type: NotificationType; text: string }>
> = {
  [OrderStatus.PAID]: {
    type: NotificationType.ORDER_PAID,
    text: 'was paid. We are preparing it.',
  },
  [OrderStatus.SHIPPED]: {
    type: NotificationType.ORDER_SHIPPED,
    text: 'was shipped and is on its way.',
  },
  [OrderStatus.DELIVERED]: {
    type: NotificationType.ORDER_DELIVERED,
    text: 'was delivered. Enjoy!',
  },
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly couponsService: CouponsService,
    private readonly auditLogs: AuditLogsService,
    private readonly notifications: NotificationsService,
    private readonly cache: CacheInvalidationService,
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
  public async checkout(
    userId: string,
    dto: CheckoutDto,
    ip?: string,
  ): Promise<Order> {
    const order = await this.dataSource.transaction(async (manager) => {
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
        stockLeft: number;
      }[] = [];

      for (const row of cart) {
        const updated = rowsOf<{
          id: number;
          title: string;
          price: number;
          stock: number;
        }>(
          await manager.query(
            ` UPDATE products SET "stock" = "stock" - $1, "updatedAt" = now()
              WHERE "id" = $2 AND "stock" >= $1
              RETURNING "id", "title", "price", "stock"`,
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
          priceCents: toCents(updated[0].price),
          quantity: row.quantity,
          stockLeft: updated[0].stock,
        });
      }

      const subtotalCents = lines.reduce(
        (sum, line) => sum + line.priceCents * line.quantity,
        0,
      );

      // The coupon is used after the stock (products are always locked before
      // coupons, here and in cancel, so the two can never deadlock).
      let discountCents = 0;
      let coupon: { id: number; code: string } | null = null;

      if (dto.couponCode) {
        const redeemed = await this.couponsService.redeem(
          manager,
          dto.couponCode,
          subtotalCents,
        );
        discountCents = redeemed.discountCents;
        coupon = { id: redeemed.id, code: redeemed.code };
      }

      const order = await manager.save(
        manager.create(Order, {
          userId,
          status: OrderStatus.PENDING,
          subtotal: fromCents(subtotalCents),
          discountAmount: fromCents(discountCents),
          totalPrice: fromCents(subtotalCents - discountCents),
          couponId: coupon?.id ?? null,
          couponCode: coupon?.code ?? null,
          shippingAddress: dto.shippingAddress,
        }),
      );

      await manager.save(
        lines.map((line) =>
          manager.create(OrderItem, {
            orderId: order.id,
            productId: line.productId,
            productTitle: line.title,
            unitPrice: fromCents(line.priceCents),
            quantity: line.quantity,
          }),
        ),
      );

      await this.auditLogs.record(manager, {
        userId,
        action: AuditAction.ORDER_CREATED,
        entity: 'Order',
        entityId: order.id,
        metadata: {
          totalPrice: order.totalPrice,
          items: lines.length,
          couponCode: coupon?.code ?? null,
        },
        ipAddress: ip,
      });

      // Notifications are saved with the order, and emailed after the commit
      await this.notifications.create(manager, {
        recipientId: userId,
        type: NotificationType.ORDER_CREATED,
        title: `Order #${order.id} received`,
        message: `We received your order #${order.id} (total ${order.totalPrice}). We will let you know when it is paid and shipped.`,
        relatedEntityType: 'Order',
        relatedEntityId: order.id,
      });

      const adminIds = await this.notifications.adminIds(manager);

      await this.notifications.createMany(manager, adminIds, {
        type: NotificationType.NEW_ORDER,
        title: `New order #${order.id}`,
        message: `A new order #${order.id} was placed (total ${order.totalPrice}).`,
        relatedEntityType: 'Order',
        relatedEntityId: order.id,
      });

      // Only when the stock CROSSES the threshold, so admins are told once
      for (const line of lines) {
        const before = line.stockLeft + line.quantity;
        if (line.stockLeft <= LOW_STOCK_THRESHOLD && before > LOW_STOCK_THRESHOLD) {
          await this.notifications.createMany(manager, adminIds, {
            type: NotificationType.LOW_STOCK,
            title: `Low stock: ${line.title}`,
            message: `"${line.title}" has ${line.stockLeft} unit(s) left.`,
            relatedEntityType: 'Product',
            relatedEntityId: line.productId,
          });
        }
      }

      return manager.findOneOrFail(Order, { where: { id: order.id } });
    });

    await this.cache.invalidateDashboard();

    return order;
  }

  /**
   * Orders Of The Logged In User
   */
  public async getMyOrders(userId: string, query: OrdersQueryDto) {
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
  public async getOneBy(id: number, actor: User) {
    const order = await this.findOrFail(id);
    this.assertOwnerOrAdmin(order, actor);
    return order;
  }

  /**
   * Cancel An Order (the owner or an admin) and give the stock back.
   * The status change is a compare-and-set, so cancelling twice (or from two
   * places at the same time) gives the stock back only once.
   */
  public async cancel(id: number, actor: User, ip?: string): Promise<Order> {
    const order = await this.findOrFail(id);
    this.assertOwnerOrAdmin(order, actor);

    const cancelled = await this.dataSource.transaction((manager) =>
      this.cancelInTransaction(manager, id, actor, ip),
    );

    await this.cache.invalidateDashboard();

    return cancelled;
  }

  /**
   * Change The Status Of An Order (Admin)
   */
  public async updateStatus(
    id: number,
    status: OrderStatus,
    actor: User,
    ip?: string,
  ): Promise<Order> {
    const updated = await this.dataSource.transaction(async (manager) => {
      // The row lock makes "read the status, check, change it" atomic, so two
      // admins can never both apply a transition from the same status.
      const order = await this.lockOrder(manager, id);

      if (status === OrderStatus.CANCELLED) {
        return this.cancelInTransaction(manager, id, actor, ip);
      }

      if (!TRANSITIONS[order.status].includes(status)) {
        throw new ConflictException(
          `Order cannot go from "${order.status}" to "${status}"`,
        );
      }

      await manager.update(Order, { id }, { status });

      await this.auditLogs.record(manager, {
        userId: actor.id,
        action: AuditAction.ORDER_STATUS_CHANGED,
        entity: 'Order',
        entityId: id,
        metadata: { from: order.status, to: status },
        ipAddress: ip,
      });

      const copy = STATUS_NOTIFICATIONS[status];
      if (copy && order.userId) {
        await this.notifications.create(manager, {
          recipientId: order.userId,
          type: copy.type,
          title: `Order #${id} ${status}`,
          message: `Your order #${id} ${copy.text}`,
          relatedEntityType: 'Order',
          relatedEntityId: id,
        });
      }

      return manager.findOneOrFail(Order, { where: { id } });
    });

    await this.cache.invalidateDashboard();

    return updated;
  }

  // Helpers

  private lockOrder(manager: EntityManager, id: number) {
    return manager
      .findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      })
      .then((order) => {
        if (!order) {
          throw new NotFoundException(`Order with id ${id} not found`);
        }
        return order;
      });
  }

  private async cancelInTransaction(
    manager: EntityManager,
    id: number,
    actor: User,
    ip?: string,
  ) {
    const order = await this.lockOrder(manager, id);

    if (![OrderStatus.PENDING, OrderStatus.PAID].includes(order.status)) {
      throw new ConflictException(
        `Order cannot be cancelled, it is already "${order.status}"`,
      );
    }

    await manager.update(Order, { id }, { status: OrderStatus.CANCELLED });

    const items = rowsOf<{ productId: number; quantity: number }>(
      await manager.query(
        ` SELECT "productId", "quantity" FROM order_items
          WHERE "orderId" = $1 AND "productId" IS NOT NULL
          ORDER BY "productId"`,
        [id],
      ),
    );

    for (const item of items) {
      await manager.query(
        ` UPDATE products SET "stock" = "stock" + $1, "updatedAt" = now()
          WHERE "id" = $2`,
        [item.quantity, item.productId],
      );
    }

    // the coupon use goes back too (after the products: same lock order as checkout)
    const [{ couponId }] = rowsOf<{ couponId: number | null }>(
      await manager.query(`SELECT "couponId" FROM orders WHERE "id" = $1`, [
        id,
      ]),
    );
    if (couponId) {
      await this.couponsService.release(manager, couponId);
    }

    await this.auditLogs.record(manager, {
      userId: actor.id,
      action: AuditAction.ORDER_CANCELLED,
      entity: 'Order',
      entityId: id,
      metadata: { from: order.status, ownerId: order.userId },
      ipAddress: ip,
    });

    if (order.userId) {
      await this.notifications.create(manager, {
        recipientId: order.userId,
        type: NotificationType.ORDER_CANCELLED,
        title: `Order #${id} cancelled`,
        message: `Your order #${id} was cancelled and the items went back to stock.`,
        relatedEntityType: 'Order',
        relatedEntityId: id,
      });
    }

    return manager.findOneOrFail(Order, { where: { id } });
  }

  private async list(
    filter: { userId?: string; status?: OrderStatus },
    query: OrdersQueryDto,
  ) {
    const { sortBy, sortOrder } = resolveSort(
      query,
      ORDER_SORT_FIELDS,
      'createdAt',
    );

    const [items, total] = await this.ordersRepository.findAndCount({
      where: {
        ...(filter.userId ? { userId: filter.userId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      order: { [sortBy]: sortOrder, id: sortOrder },
      skip: toSkip(query),
      take: query.limit,
    });

    return Paginated.of(items, total, query);
  }

  private async findOrFail(id: number) {
    const order = await this.ordersRepository.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    return order;
  }

  private assertOwnerOrAdmin(order: Order, actor: User) {
    if (order.userId !== actor.id && actor.userType !== UserType.ADMIN) {
      throw new ForbiddenException('Access Denied, You Are Not Allowed');
    }
  }
}
