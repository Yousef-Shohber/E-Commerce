import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CouponsModule } from '../coupons/coupons.module';
import { OrderItem } from './order-item.entity';
import { OrdersController } from './orders.controller';
import { Order } from './orders.entity';
import { OrdersService } from './orders.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [
    AuditLogsModule,
    NotificationsModule,
    TypeOrmModule.forFeature([Order, OrderItem]),
    CouponsModule,
  ],
})
export class OrdersModule {}
