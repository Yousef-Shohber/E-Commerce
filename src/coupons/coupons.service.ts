import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import type { User } from '../users/users.entity';
import { CartService } from '../cart/cart.service';
import { CouponType } from '../common/enums';
import {
  Paginated,
  PaginationQueryDto,
  resolveSort,
  toSkip,
} from '../common/pagination';
import { fromCents, getChangedFields, rowsOf, toCents } from '../common/utils';
import { Coupon } from './coupon.entity';
import { CreateCouponDto } from './dtos/create-coupon.dto';
import { UpdateCouponDto } from './dtos/update-coupon.dto';

const COUPON_SORT_FIELDS = [
  'createdAt',
  'code',
  'expiresAt',
  'usedCount',
] as const;

/** How much a coupon takes off a subtotal (never more than the subtotal) */
export function discountCentsFor(
  coupon: Pick<Coupon, 'type' | 'value' | 'maxDiscountAmount'>,
  subtotalCents: number,
): number {
  let discount =
    coupon.type === CouponType.PERCENTAGE
      ? Math.round((subtotalCents * coupon.value) / 100)
      : toCents(coupon.value);

  if (coupon.maxDiscountAmount !== null) {
    discount = Math.min(discount, toCents(coupon.maxDiscountAmount));
  }

  return Math.min(discount, subtotalCents);
}

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon)
    private readonly couponsRepository: Repository<Coupon>,
    private readonly cartService: CartService,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // Admin

  public async create(dto: CreateCouponDto, actor: User, ip?: string) {
    const coupon = this.couponsRepository.create({
      minOrderAmount: 0,
      maxDiscountAmount: null,
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      isActive: true,
      ...withoutUndefined(dto),
    });

    this.assertValid(coupon);

    return this.dataSource.transaction(async (manager) => {
      await manager.save(Coupon, coupon);

      await this.auditLogs.record(manager, {
        userId: actor.id,
        action: AuditAction.COUPON_CREATED,
        entity: 'Coupon',
        entityId: coupon.id,
        metadata: { code: coupon.code, type: coupon.type, value: coupon.value },
        ipAddress: ip,
      });

      return coupon;
    });
  }

  public async getAll(query: PaginationQueryDto) {
    const { sortBy, sortOrder } = resolveSort(
      query,
      COUPON_SORT_FIELDS,
      'createdAt',
    );

    const [items, total] = await this.couponsRepository.findAndCount({
      order: { [sortBy]: sortOrder, id: sortOrder },
      skip: toSkip(query),
      take: query.limit,
    });

    return Paginated.of(items, total, query);
  }

  public async getOneBy(id: number) {
    const coupon = await this.couponsRepository.findOne({ where: { id } });

    if (!coupon) {
      throw new NotFoundException(`Coupon with id ${id} not found`);
    }

    return coupon;
  }

  public async update(
    id: number,
    dto: UpdateCouponDto,
    actor: User,
    ip?: string,
  ) {
    const coupon = await this.getOneBy(id);
    const data = withoutUndefined(dto);
    const changes = getChangedFields<Coupon>(coupon, data as Partial<Coupon>);

    Object.assign(coupon, data);
    this.assertValid(coupon);

    return this.dataSource.transaction(async (manager) => {
      await manager.save(Coupon, coupon);

      if (Object.keys(changes).length) {
        await this.auditLogs.record(manager, {
          userId: actor.id,
          action: AuditAction.COUPON_UPDATED,
          entity: 'Coupon',
          entityId: id,
          metadata: { code: coupon.code, changes },
          ipAddress: ip,
        });
      }

      return coupon;
    });
  }

  /** Orders that used the coupon keep its code and the discount they got */
  public async delete(id: number, actor: User, ip?: string) {
    const coupon = await this.getOneBy(id);

    await this.dataSource.transaction(async (manager) => {
      await manager.remove(Coupon, coupon);

      await this.auditLogs.record(manager, {
        userId: actor.id,
        action: AuditAction.COUPON_DELETED,
        entity: 'Coupon',
        entityId: id,
        metadata: { code: coupon.code },
        ipAddress: ip,
      });
    });

    return { message: 'Coupon Deleted Successfully' };
  }

  // Customer

  /**
   * "What would I pay with this code?" for the cart of the logged in user.
   * Nothing is changed: the coupon is only used when the order is placed.
   */
  public async preview(userId: string, rawCode: string) {
    const cart = await this.cartService.getCart(userId);
    const subtotalCents = toCents(cart.total);

    const coupon = await this.couponsRepository.findOne({
      where: { code: normalizeCode(rawCode) },
    });
    this.assertUsable(coupon, subtotalCents);

    const discountCents = discountCentsFor(coupon, subtotalCents);

    return {
      code: coupon.code,
      subtotal: fromCents(subtotalCents),
      discount: fromCents(discountCents),
      total: fromCents(subtotalCents - discountCents),
    };
  }

  // Used by OrdersService, inside its checkout transaction

  /**
   * Use a coupon for an order. The check above is only for good error
   * messages: what really protects the usage limit is the single UPDATE,
   * so two buyers can never both take the last use.
   */
  public async redeem(
    manager: EntityManager,
    rawCode: string,
    subtotalCents: number,
  ) {
    const coupon = await manager.findOne(Coupon, {
      where: { code: normalizeCode(rawCode) },
    });
    this.assertUsable(coupon, subtotalCents);

    const updated = rowsOf<{ id: number }>(
      await manager.query(
        `UPDATE coupons
            SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
          WHERE "id" = $1
            AND "isActive" = true
            AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
            AND ("startsAt" IS NULL OR "startsAt" <= now())
            AND ("expiresAt" IS NULL OR "expiresAt" > now())
          RETURNING "id"`,
        [coupon.id],
      ),
    );

    if (updated.length === 0) {
      throw new BadRequestException('Coupon is no longer available');
    }

    return {
      id: coupon.id,
      code: coupon.code,
      discountCents: discountCentsFor(coupon, subtotalCents),
    };
  }

  /** Give a use back (the order was cancelled) */
  public async release(manager: EntityManager, couponId: number) {
    await manager.query(
      `UPDATE coupons
          SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = now()
        WHERE "id" = $1`,
      [couponId],
    );
  }

  // Helpers

  private assertUsable(coupon: Coupon | null, subtotalCents: number) {
    const now = new Date();

    if (
      !coupon ||
      !coupon.isActive ||
      (coupon.startsAt && coupon.startsAt > now) ||
      (coupon.expiresAt && coupon.expiresAt <= now)
    ) {
      throw new BadRequestException('Coupon is invalid or expired');
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    if (subtotalCents < toCents(coupon.minOrderAmount)) {
      throw new BadRequestException(
        `The minimum order amount for this coupon is ${coupon.minOrderAmount}`,
      );
    }
  }

  private assertValid(coupon: Coupon) {
    if (coupon.type === CouponType.PERCENTAGE && coupon.value > 100) {
      throw new BadRequestException('A percentage coupon cannot exceed 100');
    }

    if (
      coupon.startsAt &&
      coupon.expiresAt &&
      coupon.expiresAt <= coupon.startsAt
    ) {
      throw new BadRequestException('expiresAt must be after startsAt');
    }
  }
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
