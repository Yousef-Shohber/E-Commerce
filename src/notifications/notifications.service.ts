import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { UserType } from '../common/enums';
import { ErrorCode } from '../common/errors';
import { Paginated, toSkip } from '../common/pagination';
import { User } from '../users/users.entity';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import {
  EmailableNotification,
  NotificationEmailDispatcher,
} from './notification-email.dispatcher';

/** Types that are also sent by email (the rest stay in the app only) */
const EMAIL_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  NotificationType.ORDER_CREATED,
  NotificationType.ORDER_PAID,
  NotificationType.ORDER_SHIPPED,
  NotificationType.ORDER_DELIVERED,
  NotificationType.ORDER_CANCELLED,
]);

export interface CreateNotificationData {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: number;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly emailDispatcher: NotificationEmailDispatcher,
  ) {}

  /**
   * Whether a notification type is also sent by email.
   * @param type Notification type.
   */
  shouldEmail(type: NotificationType): boolean {
    return EMAIL_NOTIFICATION_TYPES.has(type);
  }

  /**
   * Sends the email copy of notifications that were inserted outside of
   * `create`. Types that are not email-worthy are skipped. The notifications
   * must already be committed.
   * @param notifications Committed notifications, with their type.
   */
  emailCommitted(
    notifications: (EmailableNotification & { type: NotificationType })[],
  ): void {
    this.emailDispatcher.sendNow(
      notifications.filter((notification) =>
        this.shouldEmail(notification.type),
      ),
    );
  }

  /**
   * Create a new notification.
   * Called inside a business transaction with the transaction's manager.
   * If the type is email-worthy, the email is sent after the transaction
   * commits (and never if it rolls back).
   * @param manager Transaction manager used to insert the notification.
   * @param data Recipient, type, title, message and optional related entity.
   */
  async create(
    manager: EntityManager,
    data: CreateNotificationData,
  ): Promise<void> {
    await manager.insert(Notification, {
      recipientId: data.recipientId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedEntityType: data.relatedEntityType ?? null,
      relatedEntityId: data.relatedEntityId ?? null,
    });

    this.queueEmail(manager, data.recipientId, data);
  }

  /**
   * Create the same notification for several recipients in one insert.
   * Duplicate recipient IDs are ignored; an empty list is a no-op.
   * @param manager Transaction manager used to insert the notifications.
   * @param recipientIds IDs of the users to notify.
   * @param data Notification content shared by all recipients.
   */
  async createMany(
    manager: EntityManager,
    recipientIds: string[],
    data: Omit<CreateNotificationData, 'recipientId'>,
  ): Promise<void> {
    const recipients = [...new Set(recipientIds)];
    if (!recipients.length) return;

    await manager.insert(
      Notification,
      recipients.map((recipientId) => ({
        recipientId,
        type: data.type,
        title: data.title,
        message: data.message,
        relatedEntityType: data.relatedEntityType ?? null,
        relatedEntityId: data.relatedEntityId ?? null,
      })),
    );

    for (const recipientId of recipients) {
      this.queueEmail(manager, recipientId, data);
    }
  }

  /**
   * Create several different notifications in one insert.
   * Unlike `createMany`, each item has its own recipient, text and related
   * entity. An empty list is a no-op.
   * @param manager Transaction manager used to insert the notifications.
   * @param items One entry per notification.
   */
  async createBatch(
    manager: EntityManager,
    items: CreateNotificationData[],
  ): Promise<void> {
    if (!items.length) return;

    await manager.insert(
      Notification,
      items.map((item) => ({
        recipientId: item.recipientId,
        type: item.type,
        title: item.title,
        message: item.message,
        relatedEntityType: item.relatedEntityType ?? null,
        relatedEntityId: item.relatedEntityId ?? null,
      })),
    );

    for (const item of items) {
      this.queueEmail(manager, item.recipientId, item);
    }
  }

  /**
   * The ids of every admin (the people who get NEW_ORDER and LOW_STOCK).
   * @param manager Manager of the running transaction.
   */
  async adminIds(manager: EntityManager): Promise<string[]> {
    const rows = await manager.find(User, {
      where: { userType: UserType.ADMIN },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /**
   * Get the authenticated user's notifications (newest first).
   * @param actor Authenticated user requesting the notifications.
   * @param query Pagination and unread filter options.
   * @returns Paginated notifications; `meta.unreadCount` is the total unread.
   */
  async findAll(
    actor: User,
    query: ListNotificationsQueryDto,
  ): Promise<Paginated<Notification>> {
    const where: FindOptionsWhere<Notification> = { recipientId: actor.id };
    if (query.unread) where.isRead = false;

    const [data, total] = await this.notificationRepo.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: toSkip(query),
      take: query.limit,
    });
    const unreadCount = await this.notificationRepo.count({
      where: { recipientId: actor.id, isRead: false },
    });

    return Paginated.of(data, total, query, { unreadCount });
  }

  /**
   * Mark a specific notification as read.
   * @param actor Authenticated user.
   * @param id ID of the notification to mark as read.
   * @throws NotFoundException If the notification does not exist or does not
   * belong to the authenticated user.
   */
  async markRead(actor: User, id: number): Promise<void> {
    const result = await this.notificationRepo.update(
      { id, recipientId: actor.id },
      { isRead: true },
    );
    if (!result.affected) {
      throw new NotFoundException({
        code: ErrorCode.NOTIFICATION_NOT_FOUND,
        message: 'Notification not found',
      });
    }
  }

  /**
   * Mark all unread notifications of the authenticated user as read.
   * @param actor Authenticated user.
   */
  async markAllRead(actor: User): Promise<void> {
    await this.notificationRepo.update(
      { recipientId: actor.id, isRead: false },
      { isRead: true },
    );
  }

  private queueEmail(
    manager: EntityManager,
    recipientId: string,
    data: Pick<CreateNotificationData, 'type' | 'title' | 'message'>,
  ): void {
    if (!this.shouldEmail(data.type)) return;

    this.emailDispatcher.enqueue(manager, {
      recipientId,
      title: data.title,
      message: data.message,
    });
  }
}
