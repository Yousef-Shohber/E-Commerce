import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Review } from './reviews.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UserService } from '../users/users.service';
import { ProductsService } from '../products/products.service';
import { CreateReviewDto } from './dtos/create-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { JwtPayloadType } from '../common/types';
import { UserType } from '../common/enums';
import {
  Paginated,
  PaginationQueryDto,
  resolvePagination,
} from '../common/pagination';
import { PG_ERROR, pgErrorCode } from '../common/utils';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepository: Repository<Review>,
    private readonly userService: UserService,
    private readonly productService: ProductsService,
  ) {}

  /**
   * Create New Review
   * @param userId for Logged In User
   * @param productId for Product
   * @param CreateReviewDto for Review
   * @returns Review
   */
  public async createReview(
    userId: number,
    productId: number,
    dto: CreateReviewDto,
  ) {
    const user = await this.userService.getCurrentUser(userId);
    const product = await this.productService.getOneBy(productId);

    const review = this.reviewRepository.create({
      ...dto,
      user,
      product,
    });

    let result: Review;
    try {
      result = await this.reviewRepository.save(review);
    } catch (error) {
      if (pgErrorCode(error) === PG_ERROR.UNIQUE_VIOLATION) {
        throw new ConflictException('You already reviewed this product');
      }
      throw error;
    }

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
   * @param query for Pagination (page, limit)
   * @returns A page of reviews and the total
   */
  public async getAllReviews(query: PaginationQueryDto = {}) {
    const { skip, take } = resolvePagination(query);

    const [items, total] = await this.reviewRepository.findAndCount({
      order: { createdAt: 'DESC', id: 'DESC' },
      skip,
      take,
    });

    return Paginated.of(items, total, query);
  }

  /**
   * Reviews Of One Product (public)
   * @param productId for Product
   * @param query for Pagination (page, limit)
   * @returns A page of reviews, newest first, and the total
   */
  public async getForProduct(
    productId: number,
    query: PaginationQueryDto = {},
  ) {
    await this.productService.getOneBy(productId);

    const { skip, take } = resolvePagination(query);

    const [items, total] = await this.reviewRepository.findAndCount({
      where: { product: { id: productId } },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip,
      take,
    });

    return Paginated.of(items, total, query);
  }

  /**
   * Get Single Review
   * @returns Review
   */
  public async getOneBy(id: number) {
    const review = await this.reviewRepository.findOne({
      where: { id },
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
    userId: number,
    dto: UpdateReviewDto,
  ) {
    const review = await this.getOneBy(reviewId);
    if (review.user.id !== userId) {
      throw new ForbiddenException(
        'You are not authorized to update this review',
      );
    }

    Object.assign(review, dto);
    return this.reviewRepository.save(review);
  }

  /**
   * Delete Review
   * @param reviewId for Review
   * @param payload for User
   * @returns Deleted Message
   */
  public async deleteReview(reviewId: number, payload: JwtPayloadType) {
    const review = await this.getOneBy(reviewId);
    if (review.user.id !== payload.id && payload.userType !== UserType.ADMIN) {
      throw new ForbiddenException(
        'You are not authorized to delete this review',
      );
    }

    await this.reviewRepository.remove(review);
    return { message: 'Review deleted successfully' };
  }
}
