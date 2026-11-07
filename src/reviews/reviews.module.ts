import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { Review } from './reviews.entity';
import {
  ProductReviewsController,
  ReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController, ProductReviewsController],
  providers: [ReviewsService],
  imports: [TypeOrmModule.forFeature([Review]), ProductsModule, UsersModule],
})
export class ReviewsModule {}
