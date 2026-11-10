import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiPaginated, Auth, CurrentUser } from '../common/decorators';
import type { User } from '../users/users.entity';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
@Auth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiPaginated(
    'My notifications, newest first; `meta.unreadCount` is the total unread count',
  )
  findAll(
    @CurrentUser() actor: User,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.findAll(actor, query);
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() actor: User): Promise<null> {
    await this.notifications.markAllRead(actor);
    return null;
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() actor: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<null> {
    await this.notifications.markRead(actor, id);
    return null;
  }
}
