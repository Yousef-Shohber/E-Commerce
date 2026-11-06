import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CurrentUser } from '../users/decorators/current-user.decorator';
import type { JwtPayloadType } from '../utils/types';
import { CreateReviewDto } from './dtos/create-review.dot';
import { AuthRoleGuard } from '../users/guards/auth-role.guard';
import { Roles } from '../users/decorators/user-role.decorator';
import { UserType } from '../utils/enums';
import { PaginationQueryDto } from '../utils/pagination.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { ApiSecurity } from '@nestjs/swagger';

@Controller('api/reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post(':productId')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.USER, UserType.ADMIN)
  @ApiSecurity('bearer')
  public createReview(
    @Param('productId', ParseIntPipe) productId: number,
    @CurrentUser() payload: JwtPayloadType,
    @Body() body: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(payload.id, productId, body);
  }

  @Get()
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.ADMIN)
  @ApiSecurity('bearer')
  getAllReviews(@Query() query: PaginationQueryDto) {
    return this.reviewsService.getAllReviews(query);
  }

  @Get(':id')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.USER, UserType.ADMIN)
  @ApiSecurity('bearer')
  getReviewById(@Param('id', ParseIntPipe) id: number) {
    return this.reviewsService.getOneBy(id);
  }

  @Put(':id')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.USER, UserType.ADMIN)
  @ApiSecurity('bearer')
  updateReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateReviewDto,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    return this.reviewsService.updateReview(id, payload.id, body);
  }

  @Delete(':id')
  @UseGuards(AuthRoleGuard)
  @Roles(UserType.USER, UserType.ADMIN)
  @ApiSecurity('bearer')
  deleteReview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    return this.reviewsService.deleteReview(id, payload);
  }
}
