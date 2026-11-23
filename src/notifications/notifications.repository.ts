import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AdminTb } from '../admin/admin.entity';
import { Role } from '../common/enums/role.enum';
import { NotificationTb } from './notification.entity';

@Injectable()
export class NotificationsRepository {
  constructor(
    @InjectRepository(NotificationTb)
    private readonly notificationsRepo: Repository<NotificationTb>,
    @InjectRepository(AdminTb)
    private readonly adminsRepo: Repository<AdminTb>,
  ) {}

  findRecipients(department_id: number): Promise<AdminTb[]> {
    return this.adminsRepo.find({
      where: [
        { role: Role.ADMIN, is_active: true, department_id },
        { role: Role.HEAD_ADMIN, is_active: true, department_id },
        { role: Role.ADMIN, is_active: true, department_id: IsNull() },
        { role: Role.HEAD_ADMIN, is_active: true, department_id: IsNull() },
        { role: Role.SUPER_ADMIN, is_active: true, department_id: IsNull() },
      ],
    });
  }

  create(data: Partial<NotificationTb>): NotificationTb {
    return this.notificationsRepo.create(data);
  }

  saveMany(rows: NotificationTb[]): Promise<NotificationTb[]> {
    return this.notificationsRepo.save(rows);
  }

  save(row: NotificationTb): Promise<NotificationTb> {
    return this.notificationsRepo.save(row);
  }

  async unreadCountsFor(admin_ids: number[]): Promise<Map<number, number>> {
    if (admin_ids.length === 0) return new Map();
    const rows = await this.notificationsRepo
      .createQueryBuilder('notification')
      .select('notification.recipient_admin_id', 'recipient_admin_id')
      .addSelect('COUNT(*)', 'count')
      .where('notification.recipient_admin_id IN (:...admin_ids)', { admin_ids })
      .andWhere('notification.is_read = false')
      .groupBy('notification.recipient_admin_id')
      .getRawMany<{ recipient_admin_id: number; count: string }>();

    return new Map(rows.map((row) => [Number(row.recipient_admin_id), Number(row.count)]));
  }

  findForAdmin(admin_id: number, onlyUnread: boolean): Promise<NotificationTb[]> {
    return this.notificationsRepo.find({
      where: onlyUnread
        ? { recipient_admin_id: admin_id, is_read: false }
        : { recipient_admin_id: admin_id },
      order: { created_at: 'DESC' },
      take: 50,
      relations: ['ticket'],
    });
  }

  countUnread(admin_id: number): Promise<number> {
    return this.notificationsRepo.count({ where: { recipient_admin_id: admin_id, is_read: false } });
  }

  markRead(notification_id: number, admin_id: number): Promise<void> {
    return this.notificationsRepo
      .update({ notification_id, recipient_admin_id: admin_id }, { is_read: true })
      .then(() => undefined);
  }

  markAllRead(admin_id: number): Promise<void> {
    return this.notificationsRepo
      .update({ recipient_admin_id: admin_id, is_read: false }, { is_read: true })
      .then(() => undefined);
  }
}
