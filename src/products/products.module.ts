import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryModule } from '../common/cloudinary';
import { UsersModule } from '../users/users.module';
import { ProductImage } from './product-image.entity';
import { ProductImagesService } from './product-images.service';
import { ProductsController } from './products.controller';
import { Product } from './products.entity';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductImagesService],
  imports: [
    UsersModule,
    CloudinaryModule,
    TypeOrmModule.forFeature([Product, ProductImage]),
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
