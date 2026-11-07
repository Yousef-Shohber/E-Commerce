import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, CurrentUser } from '../common/decorators';
import type { JwtPayloadType } from '../common/types';
import { CartService } from './cart.service';
import { AddToCartDto } from './dtos/add-to-cart.dto';
import { UpdateCartItemDto } from './dtos/update-cart-item.dto';

@ApiTags('Cart')
@Controller('cart')
@Auth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  public getCart(@CurrentUser() payload: JwtPayloadType) {
    return this.cartService.getCart(payload.id);
  }

  @Post()
  public addToCart(
    @CurrentUser() payload: JwtPayloadType,
    @Body() body: AddToCartDto,
  ) {
    return this.cartService.addItem(payload.id, body);
  }

  @Delete()
  public clearCart(@CurrentUser() payload: JwtPayloadType) {
    return this.cartService.clear(payload.id);
  }

  @Put('/:productId')
  public updateQuantity(
    @CurrentUser() payload: JwtPayloadType,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: UpdateCartItemDto,
  ) {
    return this.cartService.setQuantity(payload.id, productId, body.quantity);
  }

  @Delete('/:productId')
  public removeFromCart(
    @CurrentUser() payload: JwtPayloadType,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.cartService.removeItem(payload.id, productId);
  }
}
