import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { CacheInvalidationService } from '../common/cache';
import { Review } from './reviews.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/users.entity';
import { ProductsService } from '../products/products.service';
import { CreateReviewDto } from './dtos/create-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { UserType } from '../common/enums';
import {
  Paginated,
  PaginationQueryDto,
  resolveSort,
  toSkip,
} from '../common/pagination';

const REVIEW_SORT_FIELDS = ['createdAt', 'rating'] as const;

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    private readonly productService: ProductsService,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
    private readonly cache: CacheInvalidationService,
  ) {}

  /**
   * Create New Review
   * @param user the Logged In User
   * @param productId for Product
   * @param CreateReviewDto for Review
   * @returns Review
   */
  public async createReview(
    user: User,
    productId: number,
    dto: CreateReviewDto,
  ) {
    const product = await this.productService.getOneBy(productId);

    const review = this.reviewRepository.create({
      ...dto,
      user,
      product,
    });

    // reviewing the same product twice is rejected by the database
    // (unique user + product) and answered by the exceptions filter
    const result = await this.reviewRepository.save(review);
    await this.cache.invalidateDashboard();

    return {
      id: result.id,
      rating: result.rating,
      comment: result.comment,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      userId: user.id,
      productId: product.id,
    };
  }

  /**
   * Get All Review (Admin)
   * @param query for Pagination (page, limit, sortBy, sortOrder)
   * @returns A page of reviews and the total
   */
  public async getAllReviews(query: PaginationQueryDto) {
    const { sortBy, sortOrder } = resolveSort(
      query,
      REVIEW_SORT_FIELDS,
      'createdAt',
    );

    const [items, total] = await this.reviewRepository.findAndCount({
      order: { [sortBy]: sortOrder, id: sortOrder },
      skip: toSkip(query),
      take: query.limit,
    });

    return Paginated.of(items, total, query);
  }

  /**
   * Reviews Of One Product (public)
   * @param productId for Product
   * @param query for Pagination (page, limit)
   * @returns A page of reviews, newest first, and the total
   */
  public async getForProduct(productId: number, query: PaginationQueryDto) {
    await this.productService.getOneBy(productId);

    const { sortBy, sortOrder } = resolveSort(
      query,
      REVIEW_SORT_FIELDS,
      'createdAt',
    );

    const [items, total] = await this.reviewRepository.findAndCount({
      where: { product: { id: productId } },
      order: { [sortBy]: sortOrder, id: sortOrder },
      skip: toSkip(query),
      take: query.limit,
    });

    return Paginated.of(items, total, query);
  }

  /**
   * Get Single Review
   * @returns Review
   */
  public async getOneBy(id: number, withProduct = false) {
    const review = await this.reviewRepository.findOne({
      where: { id },
      relations: withProduct ? { product: true } : {},
    });
    if (!review) throw new NotFoundException('Review not found');

    return review;
  }

  /**
   * Update Review
   * @param id for Review
   * @param CreateReviewDto for Review
   * @returns Review
   */
  public async updateReview(
    reviewId: number,
    userId: string,
    dto: UpdateReviewDto,
  ) {
    const review = await this.getOneBy(reviewId);
    if (review.user.id !== userId) {
      throw new ForbiddenException(
        'You are not authorized to update this review',
      );
    }

    Object.assign(review, dto);
    const saved = await this.reviewRepository.save(review);
    await this.cache.invalidateDashboard();
    return saved;
  }

  /**
   * Delete Review
   * @param reviewId for Review
   * @param actor the Logged In User (the author, or an admin)
   * @returns Deleted Message
   */
  public async deleteReview(reviewId: number, actor: User, ip?: string) {
    const review = await this.getOneBy(reviewId, true);
    if (review.user.id !== actor.id && actor.userType !== UserType.ADMIN) {
      throw new ForbiddenException(
        'You are not authorized to delete this review',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.remove(review);

      // Only a moderator removing somebody else's review is worth an entry
      if (review.user.id !== actor.id) {
        await this.auditLogs.record(manager, {
          userId: actor.id,
          action: AuditAction.REVIEW_DELETED,
          entity: 'Review',
          entityId: reviewId,
          metadata: { authorId: review.user.id, productId: review.product?.id },
          ipAddress: ip,
        });
      }
    });
    await this.cache.invalidateDashboard();

    return { message: 'Review deleted successfully' };
  }
}
