import { JwtModule } from '@nestjs/jwt';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from './categories.entity';
import { UsersModule } from '../users/users.module';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  imports: [UsersModule, JwtModule, TypeOrmModule.forFeature([Category])],
  exports: [CategoriesService],
})
export class CategoriesModule {}
