import { Injectable } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';
import { UserNotificationTb } from '../notifications/user-notification.entity';
import { UserTb } from './user.entity';
import { UsersRepository } from './users.repository';

interface UserNotificationEvent {
  recipient_user_id: number;
  unread_count: number;
}

/** แจ้งเตือนฝั่งผู้แจ้ง - รูปแบบเดียวกับ NotificationsService ฝั่งแอดมิน
 *  แต่ระบุตัวตนด้วย line_id_token ที่ verify แล้วแทน JWT */
@Injectable()
export class UserNotificationsService {
  /** stream ในหน่วยความจำของ process นี้ - ถ้าสเกลหลาย instance ต้องย้ายไป Redis pub/sub */
  private readonly events$ = new Subject<UserNotificationEvent>();

  constructor(
    private readonly repo: UsersRepository,
  ) {}

  async notifyUser(user_id: number, ticket_id: string, message: string): Promise<void> {
    await this.repo.saveNotification(this.repo.createNotification({ user_id, ticket_id, message }));

    this.events$.next({
      recipient_user_id: user_id,
      unread_count: await this.unread_count(user_id),
    });
  }

  async listUnread(user_id: number): Promise<UserNotificationTb[]> {
    return this.repo.listUnreadNotifications(user_id);
  }

  async listRecent(user_id: number): Promise<UserNotificationTb[]> {
    return this.repo.listRecentNotifications(user_id);
  }

  async unread_count(user_id: number): Promise<number> {
    return this.repo.countUnreadNotifications(user_id);
  }

  async markRead(user_notification_id: number, user_id: number): Promise<void> {
    await this.repo.markNotificationRead(user_notification_id, user_id);
    this.events$.next({ recipient_user_id: user_id, unread_count: await this.unread_count(user_id) });
  }

  async markAllRead(user_id: number): Promise<void> {
    await this.repo.markAllNotificationsRead(user_id);
    this.events$.next({ recipient_user_id: user_id, unread_count: 0 });
  }

  async findByLineUserId(line_user_id: string): Promise<UserTb | null> {
    return this.repo.findByLineUserId(line_user_id);
  }

  /** ส่งแค่ unread_count ไปกระตุ้นให้ frontend โหลดรายการเต็มอีกที (เหมือน streamForAdmin) */
  streamForUser(user_id: number): Observable<{ data: { unread_count: number } }> {
    return this.events$.pipe(
      filter((event) => event.recipient_user_id === user_id),
      map((event) => ({ data: { unread_count: event.unread_count } })),
    );
  }
}
