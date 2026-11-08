import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Paginated,
  PaginationQueryDto,
  resolvePagination,
} from '../common/pagination';
import { WishlistItem } from './wishlist-item.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly wishlistRepository: Repository<WishlistItem>,
  ) {}

  /** The saved products of the user, newest first */
  public async getWishlist(userId: number, query: PaginationQueryDto = {}) {
    const { skip, take } = resolvePagination(query);

    const [items, total] = await this.wishlistRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip,
      take,
    });

    return Paginated.of(items, total, query);
  }

  /**
   * Save a product. Saving it twice is fine (same result, no error), so a
   * double click or a retry does no harm.
   */
  public async add(userId: number, productId: number) {
    await this.wishlistRepository.query(
      `INSERT INTO wishlist_items ("userId", "productId") VALUES ($1, $2)
        ON CONFLICT ("userId", "productId") DO NOTHING`,
      [userId, productId],
    );

    return this.wishlistRepository.findOneOrFail({
      where: { userId, productId },
    });
  }

  public async remove(userId: number, productId: number) {
    const result = await this.wishlistRepository.delete({ userId, productId });

    if (!result.affected) {
      throw new NotFoundException('Product is not in your wishlist');
    }

    return { message: 'Removed From Wishlist' };
  }
}
