import { Injectable } from '@nestjs/common';
import { UserTb } from './user.entity';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
  ) {}

  // เขียนแบบ JavaScript-style ได้: ไม่ต้องระบุ return type ทุก method
  async findByLineUserId(line_user_id: string): Promise<UserTb | null> {
    return this.usersRepo.findByLineUserId(line_user_id);
  }

  /**
   * หา user จาก LINE userId - ไม่เจอสร้างใหม่ เจอแล้วอัปเดตชื่อ/รูปเป็นค่าล่าสุด
   * เรียกเฉพาะตอนมี line_user_id ที่ verify แล้วเท่านั้น
   */
  async findOrCreateFromLineProfile(
    line_user_id: string,
    line_display_name?: string | null,
    line_picture_url?: string | null,
  ): Promise<UserTb> {
    const existing = await this.findByLineUserId(line_user_id);
    if (existing) {
      existing.line_display_name = line_display_name ?? existing.line_display_name;
      existing.line_picture_url = line_picture_url ?? existing.line_picture_url;
      return this.usersRepo.saveUser(existing);
    }

    const saved = await this.usersRepo.saveUser(
      this.usersRepo.createUser({
        line_user_id,
        line_display_name: line_display_name ?? null,
        line_picture_url: line_picture_url ?? null,
      }),
    );
    return saved;
  }
}
