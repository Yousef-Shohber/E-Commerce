import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartItem } from './cart-item.entity';
import { AddToCartDto } from './dtos/add-to-cart.dto';
import { PG_ERROR, pgErrorCode, fromCents, toCents } from '../common/utils';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private readonly cartRepository: Repository<CartItem>,
  ) {}

  /**
   * Get The Cart Of The Logged In User
   * @param userId User ID From Payload
   * @returns Cart items with product info and the total price
   */
  public async getCart(userId: number) {
    const rows = await this.cartRepository
      .createQueryBuilder('c')
      .leftJoin('c.product', 'p')
      .select([
        'c.id',
        'c.productId',
        'c.quantity',
        'p.title',
        'p.price',
        'p.stock',
      ])
      .where('c.userId = :userId', { userId })
      .orderBy('c.id', 'ASC')
      .getMany();

    let totalCents = 0;

    const items = rows.map((row) => {
      const unitCents = toCents(row.product.price);
      totalCents += unitCents * row.quantity;

      return {
        id: row.id,
        productId: row.productId,
        title: row.product.title,
        price: row.product.price,
        stock: row.product.stock,
        quantity: row.quantity,
        subtotal: fromCents(unitCents * row.quantity),
      };
    });

    return { items, total: fromCents(totalCents) };
  }

  /**
   * Add A Product To The Cart (adds to the quantity if it is already there)
   * @param userId User ID From Payload
   * @param dto Product And Quantity
   * @returns The Updated Cart
   */
  public async addItem(userId: number, dto: AddToCartDto) {
    try {
      // one atomic statement, so two parallel requests can't lose an update
      await this.cartRepository.query(
        ` INSERT INTO cart_items ("userId", "productId", "quantity")
          VALUES ($1, $2, $3)
          ON CONFLICT ("userId", "productId")
          DO UPDATE SET "quantity" = cart_items."quantity" + EXCLUDED."quantity",
                        "updatedAt" = now()`,
        [userId, dto.productId, dto.quantity],
      );
    } catch (error) {
      const code = pgErrorCode(error);

      if (code === PG_ERROR.FOREIGN_KEY_VIOLATION) {
        throw new NotFoundException(
          `Product with id ${dto.productId} not found`,
        );
      }
      if (code === PG_ERROR.CHECK_VIOLATION) {
        throw new BadRequestException('Maximum quantity per product is 99');
      }
      throw error;
    }

    return this.getCart(userId);
  }

  /**
   * Set The Quantity Of A Product In The Cart
   */
  public async setQuantity(
    userId: number,
    productId: number,
    quantity: number,
  ) {
    const result = await this.cartRepository.update(
      { userId, productId },
      { quantity },
    );

    if (!result.affected) {
      throw new NotFoundException('Product is not in your cart');
    }

    return this.getCart(userId);
  }

  /**
   * Remove A Product From The Cart
   */
  public async removeItem(userId: number, productId: number) {
    const result = await this.cartRepository.delete({ userId, productId });

    if (!result.affected) {
      throw new NotFoundException('Product is not in your cart');
    }

    return this.getCart(userId);
  }

  /**
   * Empty The Cart
   */
  public async clear(userId: number) {
    await this.cartRepository.delete({ userId });
    return { message: 'Cart Cleared Successfully' };
  }
}
