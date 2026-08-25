import { Logger } from '@nestjs/common';

/**
 * เช็ค env ที่จำเป็นก่อนแอปเริ่มทำงาน (เรียกก่อน NestFactory.create() ด้วยซ้ำ)
 *
 * เคสที่อันตรายที่สุด: JWT_SECRET เป็น undefined แล้ว @nestjs/jwt ไม่ throw ตอน sign เลย
 * ทุก token จะถูกเซ็นด้วยค่าเดาได้ ปลอมเป็นแอดมินได้ทันที โดยแอปยังรันปกติเหมือนไม่มีอะไรผิด
 * จึงต้อง fail-fast ตรงนี้แทนปล่อยให้กลายเป็นช่องโหว่เงียบๆ
 */
export function validateRequiredEnv(): void {
  const logger = new Logger('EnvValidation');
  // Connection and identity values are explicit in every environment so a
  // developer cannot accidentally connect to an unintended local database.
  const alwaysRequired = [
    'PORT',
    'CORS_ORIGIN',
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
    'DB_TIMEZONE',
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
  ];

  const missing: string[] = [];

  for (const key of alwaysRequired) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }

  if (process.env.DB_TIMEZONE && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(process.env.DB_TIMEZONE)) {
    missing.push('DB_TIMEZONE (ต้องเป็น timezone เช่น Asia/Bangkok หรือ UTC)');
  }

  const numericConfig: Array<[string, number, number]> = [
    ['PORT', 1, 65535],
    ['DB_PORT', 1, 65535],
    ['SLA_WORK_START_HOUR', 0, 23],
    ['SLA_WORK_START_MINUTE', 0, 59],
    ['SLA_WORK_END_HOUR', 0, 23],
    ['SLA_WORK_END_MINUTE', 0, 59],
  ];
  for (const [key, min, max] of numericConfig) {
    const value = process.env[key];
    if (value !== undefined && (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)) {
      missing.push(`${key} (ต้องเป็นตัวเลข ${min}-${max})`);
    }
  }
  if (process.env.SLA_URGENT_24_7 !== undefined && !['true', 'false'].includes(process.env.SLA_URGENT_24_7)) {
    missing.push('SLA_URGENT_24_7 (ต้องเป็น true หรือ false)');
  }

  if (missing.length > 0) {
    logger.error('ตั้งค่า environment variable ไม่ครบ - แอปจะไม่เริ่มทำงาน:');
    for (const key of missing) {
      logger.error(`  - ${key}`);
    }
    logger.error('ดูตัวอย่างค่าที่ต้องตั้งได้ที่ .env.example');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
