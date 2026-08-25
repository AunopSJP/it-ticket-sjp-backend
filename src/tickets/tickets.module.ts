import { BadRequestException, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TicketTb } from './entities/ticket.entity';
import { TicketImageTb } from './entities/ticket-image.entity';
import { TicketHistoryTb } from './entities/ticket-history.entity';
import { TicketCommentTb } from './entities/ticket-comment.entity';
import { TicketsService } from './tickets.service';
import { TicketsRepository } from './tickets.repository';
import { TicketImagesRepository } from './ticket-images.repository';
import { SlaSchedulerService } from './sla-scheduler.service';
import { TicketsController } from './tickets.controller';
import { TicketImageController } from './ticket-image.controller';
import { DepartmentsModule } from '../departments/departments.module';
import { SymptomsModule } from '../symptoms/symptoms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AuditLogModule } from '../audit/audit-log.module';
import { LineModule } from '../line/line.module';
import { AdminsModule } from '../admin/admins.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TicketTb, TicketImageTb, TicketHistoryTb, TicketCommentTb]),
    DepartmentsModule,
    SymptomsModule,
    NotificationsModule,
    UsersModule,
    AuditLogModule,
    LineModule,
    AdminsModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // เก็บใน memory buffer ก่อน แล้วให้ LocalStorageService ตรวจ magic bytes ก่อนเขียนลง disk
        storage: memoryStorage(),
        limits: {
          fileSize: Number(config.get('MAX_FILE_SIZE_MB', 5)) * 1024 * 1024,
          files: Number(config.get('MAX_FILES_PER_TICKET', 5)),
          // จำกัดจำนวน field ที่ไม่ใช่ไฟล์ด้วย กันยิง multipart ที่มี field เป็นหมื่นอันมาให้ parser ทำงานหนัก
          fields: 30,
          fieldSize: 100 * 1024,
        },
        fileFilter: (_req, file, callback) => {
          // ด่านหยาบ: mimetype ที่ client ประกาศมาปลอมได้ ด่านจริงคือ magic bytes ใน LocalStorageService
          //
          // whitelist รายชนิดแทน startsWith('image/') เพราะแบบเดิมปล่อย image/svg+xml ผ่านด้วย
          // ซึ่ง SVG ฝัง <script> ได้ = stored XSS
          const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          if (!ALLOWED_MIMES.includes(file.mimetype)) {
            callback(
              new BadRequestException('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, GIF หรือ WebP เท่านั้น'),
              false,
            );
            return;
          }
          callback(null, true);
        },
      }),
    }),
  ],
  controllers: [TicketsController, TicketImageController],
  providers: [TicketsService, TicketsRepository, TicketImagesRepository, SlaSchedulerService],
})
export class TicketsModule {}
