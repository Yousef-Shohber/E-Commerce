import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from './categories.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  imports: [
    AuditLogsModule,
    TypeOrmModule.forFeature([Category]),
  ],
  exports: [CategoriesService],
})
export class CategoriesModule {}
