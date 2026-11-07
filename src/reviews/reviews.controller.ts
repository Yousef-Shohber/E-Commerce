import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser, Public } from '../common/decorators';
import { UserType } from '../common/enums';
import { PaginationQueryDto } from '../common/pagination';
import type { JwtPayloadType } from '../common/types';
import { CreateReviewDto } from './dtos/create-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post(':productId')
  @Auth()
  public createReview(
    @Param('productId', ParseIntPipe) productId: number,
    @CurrentUser() payload: JwtPayloadType,
    @Body() body: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(payload.id, productId, body);
  }

  @Get()
  @Auth(UserType.ADMIN)
  @ApiPaginated()
  getAllReviews(@Query() query: PaginationQueryDto) {
    return this.reviewsService.getAllReviews(query);
  }

  @Get(':id')
  @Auth()
  getReviewById(@Param('id', ParseIntPipe) id: number) {
    return this.reviewsService.getOneBy(id);
  }

  @Put(':id')
  @Auth()
  updateReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateReviewDto,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    return this.reviewsService.updateReview(id, payload.id, body);
  }

  @Delete(':id')
  @Auth()
  deleteReview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    return this.reviewsService.deleteReview(id, payload);
  }
}

/** The reviews of a product are a part of the product's URL */
@ApiTags('Reviews')
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get()
  @ApiPaginated('A page of reviews, newest first')
  getProductReviews(
    @Param('productId', ParseIntPipe) productId: number,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reviewsService.getForProduct(productId, query);
  }
}
