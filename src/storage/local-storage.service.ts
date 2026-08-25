import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import {
  TICKETS_SUBDIR,
  UPLOADS_ROUTE_PREFIX,
  UploadedTicketImage,
  detectImageTypeOrThrow,
} from './storage.shared';
import { errorCode, errorStack } from '../common/error-utils';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

/**
 * เก็บไฟล์แนบลง disk แล้วเสิร์ฟกลับเป็น static file ที่ /api/uploads/... (ตั้งโฟลเดอร์ที่ UPLOAD_DIR)
 * เป็น "source of truth" เสมอ - เขียนที่นี่เสร็จก่อนตอบ user ทันที ไม่ว่าจะเปิดสำรองขึ้น
 * Local disk เป็นที่เก็บรูปเพียงแห่งเดียว (ดู TicketStorageService)
 *
 * ตรวจ magic bytes ซ้ำอีกชั้นทั้งที่ multer มี fileFilter แล้ว เพราะ fileFilter เห็นแค่ Content-Type
 * ที่ client ประกาศมาเอง ซึ่งปลอมได้ - ชั้นนี้เปิดดูไบต์จริงก่อนเขียนลง disk
 */
@Injectable()
export class LocalStorageService implements OnModuleInit {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadDir: string;
  private readonly ticketsDir: string;

  // จงใจคำนวณ path ใน constructor ไม่ใช่ onModuleInit เพราะ main.ts ต้องเรียก getUploadDir()
  // ตอน mount static file ซึ่งเกิดขึ้นก่อนจุดที่ Nest เรียก onModuleInit
  constructor(private readonly config: ConfigService) {
    const configured = this.config.get<string>('UPLOAD_DIR', './uploads');
    // รองรับทั้ง absolute (/app/uploads ใน container) และ relative (./uploads ตอน dev)
    this.uploadDir = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
    this.ticketsDir = join(this.uploadDir, TICKETS_SUBDIR);
  }

  async onModuleInit() {
    await mkdir(this.ticketsDir, { recursive: true });
    this.logger.log(`เก็บไฟล์แนบตั๋วงานที่: ${this.ticketsDir}`);
  }

  getUploadDir(): string {
    return this.uploadDir;
  }

  /** path เต็มบน disk ของไฟล์นี้ */
  getAbsolutePath(file_name: string): string {
    return join(this.ticketsDir, file_name);
  }

  getContentType(file_name: string): string {
    const extension = file_name.toLowerCase().split('.').pop();
    return CONTENT_TYPES[extension ?? ''] ?? 'application/octet-stream';
  }

  async uploadTicketImage(file: Express.Multer.File): Promise<UploadedTicketImage> {
    const detected = detectImageTypeOrThrow(file.buffer);

    // ตั้งชื่อไฟล์ใหม่จาก UUID + นามสกุลที่ "ตรวจได้จริง" ไม่เอาชื่อ/นามสกุลเดิมจากผู้ใช้เลย
    // (กัน path traversal เช่น ../../etc/passwd และนามสกุลหลอกแบบ evil.jpg.html)
    const file_name = `${randomUUID()}${detected.ext}`;
    const absolutePath = join(this.ticketsDir, file_name);

    try {
      await writeFile(absolutePath, file.buffer, { flag: 'wx' });
    } catch (err) {
      this.logger.error(`เขียนไฟล์ ${file_name} ลง disk ไม่สำเร็จ`, errorStack(err));
      throw err;
    }

    return {
      file_name,
      public_url: `${UPLOADS_ROUTE_PREFIX}/${TICKETS_SUBDIR}/${file_name}`,
    };
  }

  /** ใช้ตอน rollback ถ้าสร้างตั๋วไม่สำเร็จหลังอัปโหลดรูปไปแล้ว - ไฟล์ไม่มีอยู่ถือว่าสำเร็จ */
  async deleteTicketImage(file_name: string): Promise<void> {
    try {
      await unlink(join(this.ticketsDir, file_name));
    } catch (err) {
      const code = errorCode(err);
      if (code !== 'ENOENT') {
        this.logger.warn(`ลบไฟล์ ${file_name} ไม่สำเร็จ: ${String(err)}`);
      }
    }
  }
}
