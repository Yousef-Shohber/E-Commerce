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
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiPaginated, Auth, CurrentUser, Public } from '../common/decorators';
import { UserType } from '../common/enums';
import { PaginationQueryDto } from '../common/pagination';
import type { User } from '../users/users.entity';
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
    @CurrentUser() user: User,
    @Body() body: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(user, productId, body);
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
    @CurrentUser() user: User,
  ) {
    return this.reviewsService.updateReview(id, user.id, body);
  }

  @Delete(':id')
  @Auth()
  deleteReview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.reviewsService.deleteReview(id, user, req.ip);
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
