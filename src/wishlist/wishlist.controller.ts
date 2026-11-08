import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination';
import type { User } from '../users/users.entity';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@Controller('wishlist')
@Auth()
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiPaginated('Saved products, newest first')
  public getWishlist(
    @CurrentUser() user: User,
    @Query() query: PaginationQueryDto,
  ) {
    return this.wishlistService.getWishlist(user.id, query);
  }

  @Post('/:productId')
  @HttpCode(HttpStatus.OK)
  public add(
    @CurrentUser() user: User,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.wishlistService.add(user.id, productId);
  }

  @Delete('/:productId')
  public remove(
    @CurrentUser() user: User,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.wishlistService.remove(user.id, productId);
  }
}
