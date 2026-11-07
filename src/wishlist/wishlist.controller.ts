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
import type { JwtPayloadType } from '../common/types';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@Controller('wishlist')
@Auth()
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiPaginated('Saved products, newest first')
  public getWishlist(
    @CurrentUser() payload: JwtPayloadType,
    @Query() query: PaginationQueryDto,
  ) {
    return this.wishlistService.getWishlist(payload.id, query);
  }

  @Post('/:productId')
  @HttpCode(HttpStatus.OK)
  public add(
    @CurrentUser() payload: JwtPayloadType,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.wishlistService.add(payload.id, productId);
  }

  @Delete('/:productId')
  public remove(
    @CurrentUser() payload: JwtPayloadType,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.wishlistService.remove(payload.id, productId);
  }
}
