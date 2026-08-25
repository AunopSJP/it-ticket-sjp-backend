import { Injectable } from '@nestjs/common';
import { Subject, Observable, filter, map } from 'rxjs';
import { NotificationTb } from './notification.entity';
import { AdminTb } from '../admin/admin.entity';
import { NotificationsRepository } from './notifications.repository';

interface NotificationEvent {
  recipient_admin_id: number;
  unread_count: number;
}

@Injectable()
export class NotificationsService {
  /** stream ในหน่วยความจำของ process นี้ - ถ้าสเกลหลาย instance ต้องย้ายไป Redis pub/sub */
  private readonly events$ = new Subject<NotificationEvent>();

  constructor(
    private readonly repo: NotificationsRepository,
  ) {}

  /** แอดมินแผนกของตั๋วนี้ + super admin เท่านั้นที่ได้รับ (เดิมแจ้งรวมทุกคนทุกแผนก) */
  async notifyAllAdmins(ticket_id: string, message: string, department_id: number): Promise<void> {
    const admins = await this.repo.findRecipients(department_id);
    if (admins.length === 0) return;

    const rows = admins.map((admin) =>
      this.repo.create({ recipient_admin_id: admin.admin_id, ticket_id, message }),
    );
    await this.repo.saveMany(rows);

    // ดึง unread count ของทุกคนด้วย query เดียว (group by) แทนนับทีละคน - เดิมแอดมิน 10 คน
    // = ยิง COUNT ซ้ำ 10 ครั้งทุกครั้งที่มี event
    const unreadCounts = await this.repo.unreadCountsFor(admins.map((a) => a.admin_id));
    for (const admin of admins) {
      this.events$.next({
        recipient_admin_id: admin.admin_id,
        unread_count: unreadCounts.get(admin.admin_id) ?? 0,
      });
    }
  }

  /** แจ้งเตือนแอดมินคนเดียวเจาะจง - ใช้กับข้อความแชทที่ควรไปหาเฉพาะ assignee ไม่ใช่ทั้งแผนก */
  async notifyAdmin(adminId: number, ticket_id: string, message: string): Promise<void> {
    await this.repo.save(this.repo.create({ recipient_admin_id: adminId, ticket_id, message }));
    this.events$.next({ recipient_admin_id: adminId, unread_count: await this.unread_count(adminId) });
  }

  findForAdmin(adminId: number, onlyUnread = false) {
    return this.repo.findForAdmin(adminId, onlyUnread);
  }

  async unread_count(adminId: number): Promise<number> {
    return this.repo.countUnread(adminId);
  }

  async markRead(notification_id: number, adminId: number): Promise<void> {
    await this.repo.markRead(notification_id, adminId);
    this.events$.next({ recipient_admin_id: adminId, unread_count: await this.unread_count(adminId) });
  }

  async markAllRead(adminId: number): Promise<void> {
    await this.repo.markAllRead(adminId);
    this.events$.next({ recipient_admin_id: adminId, unread_count: 0 });
  }

  /** ส่งแค่ unread_count ไปกระตุ้นให้ frontend โหลดรายการเต็มผ่าน REST อีกที
   *  เพื่อให้ endpoint REST ยังเป็นแหล่งความจริงเดียวของข้อมูล */
  streamForAdmin(adminId: number): Observable<{ data: { unread_count: number } }> {
    return this.events$.pipe(
      filter((event) => event.recipient_admin_id === adminId),
      map((event) => ({ data: { unread_count: event.unread_count } })),
    );
  }
}
