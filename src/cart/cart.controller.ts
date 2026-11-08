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
import type { User } from '../users/users.entity';
import { CartService } from './cart.service';
import { AddToCartDto } from './dtos/add-to-cart.dto';
import { UpdateCartItemDto } from './dtos/update-cart-item.dto';

@ApiTags('Cart')
@Controller('cart')
@Auth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  public getCart(@CurrentUser() user: User) {
    return this.cartService.getCart(user.id);
  }

  @Post()
  public addToCart(@CurrentUser() user: User, @Body() body: AddToCartDto) {
    return this.cartService.addItem(user.id, body);
  }

  @Delete()
  public clearCart(@CurrentUser() user: User) {
    return this.cartService.clear(user.id);
  }

  @Put('/:productId')
  public updateQuantity(
    @CurrentUser() user: User,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: UpdateCartItemDto,
  ) {
    return this.cartService.setQuantity(user.id, productId, body.quantity);
  }

  @Delete('/:productId')
  public removeFromCart(
    @CurrentUser() user: User,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.cartService.removeItem(user.id, productId);
  }
}
