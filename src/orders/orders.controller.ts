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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser } from '../common/decorators';
import { UserType } from '../common/enums';
import type { JwtPayloadType } from '../common/types';
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
    @CurrentUser() payload: JwtPayloadType,
    @Body() body: CheckoutDto,
  ) {
    return this.ordersService.checkout(payload.id, body);
  }

  @Get('/me')
  @ApiPaginated('My orders, newest first')
  public getMyOrders(
    @CurrentUser() payload: JwtPayloadType,
    @Query() query: OrdersQueryDto,
  ) {
    return this.ordersService.getMyOrders(payload.id, query);
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
  @Auth(UserType.ADMIN)
  public updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, body.status);
  }
}
