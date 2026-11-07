import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartModule } from '../cart/cart.module';
import { CouponsController } from './coupons.controller';
import { Coupon } from './coupon.entity';
import { CouponsService } from './coupons.service';

@Module({
  controllers: [CouponsController],
  providers: [CouponsService],
  imports: [TypeOrmModule.forFeature([Coupon]), CartModule],
  exports: [CouponsService],
})
export class CouponsModule {}
