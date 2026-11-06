import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartItem } from './cart-item.entity';
import { UsersModule } from '../users/users.module';

@Module({
  controllers: [CartController],
  providers: [CartService],
  imports: [UsersModule, JwtModule, TypeOrmModule.forFeature([CartItem])],
})
export class CartModule {}
