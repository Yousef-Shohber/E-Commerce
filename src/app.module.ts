import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from '../db/data-source';
import { AppController } from './app.controller';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { validateEnv } from './config/env.validation';
import { CouponsModule } from './coupons/coupons.module';
import { MailModule } from './mail/mail.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UsersModule } from './users/users.module';
import { WishlistModule } from './wishlist/wishlist.module';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env'
          : `.env.${process.env.NODE_ENV ?? 'development'}`,
      validate: validateEnv,
    }),
    TypeOrmModule.forRoot(dataSourceOptions),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: Number(process.env.THROTTLE_LIMIT ?? 100),
        },
      ],
      skipIf: () => process.env.THROTTLE_DISABLED === 'true',
    }),
    CommonModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    ReviewsModule,
    CartModule,
    CouponsModule,
    OrdersModule,
    WishlistModule,
    MailModule,
  ],

  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
