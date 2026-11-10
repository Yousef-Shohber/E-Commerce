import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { Notification } from './entities/notification.entity';
import { NotificationEmailDispatcher } from './notification-email.dispatcher';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationEmailDispatcher],
  exports: [NotificationsService],
})
export class NotificationsModule {}
