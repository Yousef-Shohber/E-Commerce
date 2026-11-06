import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import type { Response } from 'express';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dtos/checkout.dto';
import { UpdateOrderStatusDto } from './dtos/update-order-status.dto';
import { AdminOrdersQueryDto, OrdersQueryDto } from './dtos/orders-query.dto';
import { CurrentUser } from '../users/decorators/current-user.decorator';
import { Roles } from '../users/decorators/user-role.decorator';
import { AuthRoleGuard } from '../users/guards/auth-role.guard';
import { UserType } from '../utils/enums';
import type { JwtPayloadType } from '../utils/types';

@Controller('/api/orders')
@UseGuards(AuthRoleGuard)
@Roles(UserType.USER, UserType.ADMIN)
@ApiSecurity('bearer')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Checkout: creates an order from the cart
  @Post()
  public checkout(
    @CurrentUser() payload: JwtPayloadType,
    @Body() body: CheckoutDto,
  ) {
    return this.ordersService.checkout(payload.id, body);
  }

  @Get('/me')
  public async getMyOrders(
    @CurrentUser() payload: JwtPayloadType,
    @Query() query: OrdersQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.ordersService.getMyOrders(
      payload.id,
      query,
    );
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @Get()
  @Roles(UserType.ADMIN)
  public async getAllOrders(
    @Query() query: AdminOrdersQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { items, total } = await this.ordersService.getAllOrders(query);
    res.setHeader('X-Total-Count', String(total));
    return items;
  }

  @Get('/:id')
  public getOrderById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    return this.ordersService.getOneBy(id, payload);
  }

  @Post('/:id/cancel')
  @HttpCode(HttpStatus.OK)
  public cancelOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() payload: JwtPayloadType,
  ) {
    return this.ordersService.cancel(id, payload);
  }

  @Patch('/:id/status')
  @Roles(UserType.ADMIN)
  public updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, body.status);
  }
}
