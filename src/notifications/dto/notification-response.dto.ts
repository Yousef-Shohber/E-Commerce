import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../enums/notification-type.enum';

export class NotificationResponseDto {
  @ApiProperty() id: number;

  @ApiProperty({ enum: NotificationType }) type: NotificationType;

  @ApiProperty() title: string;

  @ApiProperty() message: string;

  @ApiProperty() isRead: boolean;

  @ApiProperty({ nullable: true, type: String }) relatedEntityType:
    | string
    | null;

  @ApiProperty({ nullable: true, type: Number }) relatedEntityId:
    | number
    | null;

  @ApiProperty() createdAt: Date;
}
