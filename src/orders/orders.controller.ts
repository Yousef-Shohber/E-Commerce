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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser } from '../common/decorators';
import { UserType } from '../common/enums';
import type { User } from '../users/users.entity';
import { CheckoutDto } from './dtos/checkout.dto';
import { AdminOrdersQueryDto, OrdersQueryDto } from './dtos/orders-query.dto';
import { UpdateOrderStatusDto } from './dtos/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('orders')
@Auth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Checkout: creates an order from the cart (optionally with a coupon)
  @Post()
  public checkout(
    @CurrentUser() user: User,
    @Body() body: CheckoutDto,
    @Req() req: Request,
  ) {
    return this.ordersService.checkout(user.id, body, req.ip);
  }

  @Get('/me')
  @ApiPaginated('My orders, newest first')
  public getMyOrders(
    @CurrentUser() user: User,
    @Query() query: OrdersQueryDto,
  ) {
    return this.ordersService.getMyOrders(user.id, query);
  }

  @Get()
  @Auth(UserType.ADMIN)
  @ApiPaginated('All orders, newest first')
  public getAllOrders(@Query() query: AdminOrdersQueryDto) {
    return this.ordersService.getAllOrders(query);
  }

  @Get('/:id')
  public getOrderById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.ordersService.getOneBy(id, user);
  }

  @Post('/:id/cancel')
  @HttpCode(HttpStatus.OK)
  public cancelOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.ordersService.cancel(id, user, req.ip);
  }

  @Patch('/:id/status')
  @Auth(UserType.ADMIN)
  public updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrderStatusDto,
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    return this.ordersService.updateStatus(id, body.status, user, req.ip);
  }
}
