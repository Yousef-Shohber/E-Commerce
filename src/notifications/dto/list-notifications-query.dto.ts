import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { ToBoolean } from '../../common/utils';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only the unread ones' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  unread?: boolean;
}
