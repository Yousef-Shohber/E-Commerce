import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryModule } from '../common/cloudinary';
import { ProductImagesService } from './product-images.service';
import { ProductsController } from './products.controller';
import { Product } from './products.entity';
import { ProductsService } from './products.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductImagesService],
  imports: [
    AuditLogsModule,
    CloudinaryModule,
    TypeOrmModule.forFeature([Product]),
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
