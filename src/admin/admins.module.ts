import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminTb } from './admin.entity';
import { TicketTb } from '../tickets/entities/ticket.entity';
import { AdminsService } from './admins.service';
import { AdminsController } from './admins.controller';
import { AdminsRepository } from './admins.repository';

@Module({
  // TicketTb เพิ่มเข้ามาเพื่อให้ setActive() นับจำนวนตั๋วที่ยังไม่ปิดของแอดมินที่กำลังจะถูกปิดใช้งานได้
  // (เตือน super admin ว่ามีตั๋วค้างอยู่ กันเผลอ deactivate แล้วลืมว่ามีงานค้างเป็นชื่อคนนั้นอยู่)
  imports: [TypeOrmModule.forFeature([AdminTb, TicketTb])],
  controllers: [AdminsController],
  providers: [AdminsService, AdminsRepository],
  exports: [AdminsService],
})
export class AdminsModule {}
