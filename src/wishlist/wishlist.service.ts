import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Paginated,
  PaginationQueryDto,
  resolveSort,
  toSkip,
} from '../common/pagination';
import { WishlistItem } from './wishlist-item.entity';

const WISHLIST_SORT_FIELDS = ['createdAt'] as const;

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly wishlistRepository: Repository<WishlistItem>,
  ) {}

  /** The saved products of the user (newest first unless sorted otherwise) */
  public async getWishlist(userId: string, query: PaginationQueryDto) {
    const { sortBy, sortOrder } = resolveSort(
      query,
      WISHLIST_SORT_FIELDS,
      'createdAt',
    );

    const [items, total] = await this.wishlistRepository.findAndCount({
      where: { userId },
      order: { [sortBy]: sortOrder, id: sortOrder },
      skip: toSkip(query),
      take: query.limit,
    });

    return Paginated.of(items, total, query);
  }

  /**
   * Save a product. Saving it twice is fine (same result, no error), so a
   * double click or a retry does no harm.
   */
  public async add(userId: string, productId: number) {
    // a product that does not exist is rejected by the database (foreign key)
    // and answered by the exceptions filter
    await this.wishlistRepository.query(
      `INSERT INTO wishlist_items ("userId", "productId") VALUES ($1, $2)
        ON CONFLICT ("userId", "productId") DO NOTHING`,
      [userId, productId],
    );

    return this.wishlistRepository.findOneOrFail({
      where: { userId, productId },
    });
  }

  public async remove(userId: string, productId: number) {
    const result = await this.wishlistRepository.delete({ userId, productId });

    if (!result.affected) {
      throw new NotFoundException('Product is not in your wishlist');
    }

    return { message: 'Removed From Wishlist' };
  }
}
