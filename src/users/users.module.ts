import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryModule } from '../common/cloudinary';
import { MailModule } from '../mail/mail.module';
import { AuthProvider } from './auth.provider';
import { GoogleStrategy } from './google.strategy';
import { UsersController } from './users.controller';
import { User } from './users.entity';
import { UserService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UserService, AuthProvider, GoogleStrategy],
  exports: [UserService],
  imports: [
    MailModule,
    PassportModule,
    CloudinaryModule,
    TypeOrmModule.forFeature([User]),
  ],
})
export class UsersModule {}
