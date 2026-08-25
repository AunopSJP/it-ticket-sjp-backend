import { BadRequestException } from '@nestjs/common';

export interface UploadedTicketImage {
  /** ชื่อไฟล์บน local disk ที่ใช้อ้างอิงหรือลบภายหลัง */
  file_name: string;
  /** path ที่ frontend เอาไปใส่ <img src> ได้ตรงๆ เก็บลง ticket_image_tb.file_path
   *  เป็น relative path เสมอ จะได้ย้ายโดเมน/พอร์ต/ที่เก็บไฟล์ทีหลังโดยไม่ต้องแก้ข้อมูลเก่า */
  public_url: string;
}

export const UPLOADS_ROUTE_PREFIX = '/api/uploads';
export const TICKETS_SUBDIR = 'tickets';

export interface DetectedImageType {
  ext: string;
  mime: string;
}

/**
 * ชนิดไฟล์รูปที่อนุญาต ตรวจจาก "magic bytes" (ไบต์ต้นไฟล์จริง) ไม่ใช่จาก mimetype ที่ client ส่งมา
 * เพราะ mimetype ปลอมได้ง่ายมาก แค่แก้ header ตอนยิง request
 *
 * จงใจไม่รับ SVG แม้จะเป็น "รูป" เหมือนกัน เพราะ SVG คือ XML ที่ฝัง <script> ได้
 * ถ้าเสิร์ฟกลับมาแล้วเบราว์เซอร์เปิดตรงๆ จะกลายเป็น stored XSS ทันที
 */
const ALLOWED_IMAGE_SIGNATURES: ReadonlyArray<DetectedImageType & { test: (buf: Buffer) => boolean }> = [
  {
    ext: '.jpg',
    mime: 'image/jpeg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: '.png',
    mime: 'image/png',
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    ext: '.gif',
    mime: 'image/gif',
    test: (b) => b.length > 6 && b.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null,
  },
  {
    ext: '.webp',
    mime: 'image/webp',
    // RIFF....WEBP
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/** ตรวจไบต์จริงของไฟล์ - ไม่ตรงกับรูปที่รองรับ throw ทันที (ด่านสุดท้ายก่อนไฟล์ถูกเก็บจริง) */
export function detectImageTypeOrThrow(buffer: Buffer): DetectedImageType {
  const detected = ALLOWED_IMAGE_SIGNATURES.find((sig) => sig.test(buffer));
  if (!detected) {
    throw new BadRequestException('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG, GIF หรือ WebP เท่านั้น');
  }
  return { ext: detected.ext, mime: detected.mime };
}

/** mime type จากนามสกุลไฟล์ที่ระบบตั้งเอง */
export function mimeFromExt(ext: string): string {
  const found = ALLOWED_IMAGE_SIGNATURES.find((sig) => sig.ext === ext.toLowerCase());
  return found?.mime ?? 'application/octet-stream';
}
