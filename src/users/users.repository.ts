import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserNotificationTb } from '../notifications/user-notification.entity';
import { UserTb } from './user.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserTb)
    private readonly usersRepo: Repository<UserTb>,
    @InjectRepository(UserNotificationTb)
    private readonly notificationsRepo: Repository<UserNotificationTb>,
  ) {}

  findByLineUserId(line_user_id: string): Promise<UserTb | null> {
    return this.usersRepo.findOne({ where: { line_user_id } });
  }

  createUser(data: Partial<UserTb>): UserTb {
    return this.usersRepo.create(data);
  }

  saveUser(user: UserTb): Promise<UserTb> {
    return this.usersRepo.save(user);
  }

  createNotification(data: Partial<UserNotificationTb>): UserNotificationTb {
    return this.notificationsRepo.create(data);
  }

  saveNotification(notification: UserNotificationTb): Promise<UserNotificationTb> {
    return this.notificationsRepo.save(notification);
  }

  listUnreadNotifications(user_id: number): Promise<UserNotificationTb[]> {
    return this.notificationsRepo.find({
      where: { user_id, is_read: false },
      order: { created_at: 'DESC' },
    });
  }

  listRecentNotifications(user_id: number): Promise<UserNotificationTb[]> {
    return this.notificationsRepo.find({
      where: { user_id },
      order: { created_at: 'DESC' },
      take: 50,
    });
  }

  countUnreadNotifications(user_id: number): Promise<number> {
    return this.notificationsRepo.count({ where: { user_id, is_read: false } });
  }

  markNotificationRead(user_notification_id: number, user_id: number): Promise<void> {
    return this.notificationsRepo
      .update({ user_notification_id, user_id }, { is_read: true })
      .then(() => undefined);
  }

  markAllNotificationsRead(user_id: number): Promise<void> {
    return this.notificationsRepo
      .update({ user_id, is_read: false }, { is_read: true })
      .then(() => undefined);
  }
}
