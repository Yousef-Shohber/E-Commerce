import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryModule } from '../common/cloudinary';
import { UsersController } from './users.controller';
import { User } from './users.entity';
import { UsersService } from './users.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
  imports: [
    AuditLogsModule,
    CloudinaryModule,
    TypeOrmModule.forFeature([User]),
  ],
})
export class UsersModule {}
