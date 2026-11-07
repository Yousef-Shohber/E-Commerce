import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CartService } from '../cart/cart.service';
import { CouponType } from '../common/enums';
import {
  Paginated,
  PaginationQueryDto,
  resolvePagination,
} from '../common/pagination';
import {
  PG_ERROR,
  fromCents,
  pgErrorCode,
  rowsOf,
  toCents,
} from '../common/utils';
import { Coupon } from './coupon.entity';
import { CreateCouponDto } from './dtos/create-coupon.dto';
import { UpdateCouponDto } from './dtos/update-coupon.dto';

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
  ) {}

  // Admin

  public async create(dto: CreateCouponDto) {
    const coupon = this.couponsRepository.create({
      minOrderAmount: 0,
      maxDiscountAmount: null,
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      isActive: true,
      ...withoutUndefined(dto),
    });

    return this.saveChecked(coupon);
  }

  public async getAll(query: PaginationQueryDto = {}) {
    const { skip, take } = resolvePagination(query);

    const [items, total] = await this.couponsRepository.findAndCount({
      order: { createdAt: 'DESC', id: 'DESC' },
      skip,
      take,
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

  public async update(id: number, dto: UpdateCouponDto) {
    const coupon = await this.getOneBy(id);
    Object.assign(coupon, withoutUndefined(dto));

    return this.saveChecked(coupon);
  }

  /** Orders that used the coupon keep its code and the discount they got */
  public async delete(id: number) {
    const coupon = await this.getOneBy(id);

    await this.couponsRepository.remove(coupon);
    return { message: 'Coupon Deleted Successfully' };
  }

  // Customer

  /**
   * "What would I pay with this code?" for the cart of the logged in user.
   * Nothing is changed: the coupon is only used when the order is placed.
   */
  public async preview(userId: number, rawCode: string) {
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

  private async saveChecked(coupon: Coupon) {
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

    try {
      return await this.couponsRepository.save(coupon);
    } catch (error) {
      if (pgErrorCode(error) === PG_ERROR.UNIQUE_VIOLATION) {
        throw new ConflictException('Coupon code already exists');
      }
      throw error;
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
