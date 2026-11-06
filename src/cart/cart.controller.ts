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
} from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddToCartDto } from './dtos/add-to-cart.dto';
import { UpdateCartItemDto } from './dtos/update-cart-item.dto';
import { CurrentUser } from '../users/decorators/current-user.decorator';
import { Roles } from '../users/decorators/user-role.decorator';
import { AuthRoleGuard } from '../users/guards/auth-role.guard';
import { UserType } from '../utils/enums';
import type { JwtPayloadType } from '../utils/types';

@Controller('/api/cart')
@UseGuards(AuthRoleGuard)
@Roles(UserType.USER, UserType.ADMIN)
@ApiSecurity('bearer')
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
