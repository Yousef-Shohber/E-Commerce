import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './orders.entity';
import { OrderItem } from './order-item.entity';
import { UsersModule } from '../users/users.module';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [
    UsersModule,
    JwtModule,
    TypeOrmModule.forFeature([Order, OrderItem]),
  ],
})
export class OrdersModule {}
