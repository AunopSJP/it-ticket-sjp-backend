import * as dotenv from 'dotenv';
// โหลด .env เองตรงนี้ก่อน NestFactory.create() เพราะ validateRequiredEnv() ด้านล่างต้องอ่าน
// process.env ให้ครบก่อนแอปเริ่มสร้าง (ConfigModule โหลดช้ากว่านั้น)
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { validateRequiredEnv } from './config/validate-env';
import { LocalStorageService } from './storage/local-storage.service';
import { UPLOADS_ROUTE_PREFIX } from './storage/storage.shared';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

interface HealthResponse {
  json(body: {
    status: 'ok' | 'degraded';
    database: 'ok' | 'unavailable';
  }): void;
  status(code: number): HealthResponse;
}

async function bootstrap() {
  validateRequiredEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // trust proxy - ตัวนี้พังแล้ว rate limiting ทั้งระบบพังตาม
  //
  // backend อยู่หลัง nginx เสมอ ถ้าไม่ตั้ง req.ip จะเป็น IP ของ nginx ทำให้ ThrottlerGuard
  // นับ request ของทุกคนรวมเป็นคนเดียว (คนร้ายยิงเต็มโควต้า = ผู้ใช้จริงทั้งบริษัทใช้งานไม่ได้)
  //
  // จงใจไม่ใช้ true (เชื่อทุก hop) เพราะ client จะปลอม X-Forwarded-For หนี rate limit ได้
  app.set('trust proxy', Number(configService.get('TRUST_PROXY_HOPS', 1)));

  // ตั้งเองแทนใช้ helmet เพื่อไม่ต้องเพิ่ม dependency - ตัวสำคัญคือ nosniff
  // กันเบราว์เซอร์เดาชนิดไฟล์เองแล้วรันไฟล์แนบเป็น script
  app.use(
    (
      req: { originalUrl?: string },
      res: { setHeader: (k: string, v: string) => void },
      next: () => void,
    ) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      res.setHeader(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=()',
      );
      // Swagger UI ต้องโหลด script/style ของตัวเองเฉพาะใน dev; API อื่นไม่ควรรัน active content ใด ๆ
      if (!req.originalUrl?.startsWith('/api/docs')) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        );
      }
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );

  // อนุญาต subdomain ของ tunnel เครื่องมือทดสอบ (ngrok / Cloudflare Tunnel) เฉพาะตอน dev เพราะ URL
  // เปลี่ยนทุกครั้งที่รันใหม่ - จำกัดไว้แค่ non-production เพราะรวมกับ credentials: true แล้วใครเปิด
  // tunnel เองก็ผ่านได้
  const configuredOrigins = configService
    .getOrThrow<string>('CORS_ORIGIN')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  if (isProduction) {
    app.use(
      (
        _req: unknown,
        res: { setHeader: (k: string, v: string) => void },
        next: () => void,
      ) => {
        res.setHeader(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains',
        );
        next();
      },
    );
  }
  const ngrokPattern = /\.ngrok-free\.(dev|app)$|\.ngrok\.(io|app)$/;
  // Cloudflare Tunnel (cloudflared tunnel --url ...) แบบ quick tunnel - โดเมนสุ่ม *.trycloudflare.com เสมอ
  const cloudflareTunnelPattern = /\.trycloudflare\.com$/;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // เรียกจาก curl/Postman/mobile app ไม่มี Origin header
      let hostname: string;
      try {
        hostname = new URL(origin).hostname;
      } catch {
        return callback(new Error('Origin ไม่ถูกต้อง'), false);
      }
      const allowed =
        configuredOrigins.includes(origin) ||
        (!isProduction &&
          (ngrokPattern.test(hostname) ||
            cloudflareTunnelPattern.test(hostname)));
      callback(
        allowed ? null : new Error('ไม่อนุญาตให้เรียกจาก origin นี้ (CORS)'),
        allowed,
      );
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // ชื่อไฟล์เป็น UUID สุ่มที่เดาไม่ได้ + ตรวจชนิดไฟล์จาก magic bytes ตอนอัปโหลดแล้ว
  // (ดู LocalStorageService) ที่นี่ปิด index listing และบังคับ nosniff ซ้ำอีกชั้น
  // local disk เป็นที่เก็บจริงเสมอ (source of truth) จึง mount แบบไม่มีเงื่อนไข - แม้เปิดสำรอง

  // รูปตั๋วเก็บและเสิร์ฟจาก local storage ผ่าน TicketImageController หลังตรวจสิทธิ์แล้ว

  // จงใจไม่ query DB - แยกปัญหา "process ตาย" ออกจาก "DB ต่อไม่ติด" ไม่งั้น DB ล่มจะทำให้
  // container ถูก mark unhealthy แล้ว restart วนทั้งที่ process ยังดีอยู่
  const dataSource = app.get(DataSource);
  app
    .getHttpAdapter()
    .get('/api/health', async (_req: unknown, res: HealthResponse) => {
      try {
        await dataSource.query('SELECT 1');
        res.json({ status: 'ok', database: 'ok' });
      } catch {
        res.status(503).json({ status: 'degraded', database: 'unavailable' });
      }
    });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  // ปิดใน production - เปิดไว้เท่ากับให้ใครก็ดูโครงสร้าง API ทั้งหมดได้โดยไม่ต้อง login
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('IT Ticket System API')
      .setDescription(
        'API สำหรับระบบแจ้งปัญหา IT — endpoint ที่ขึ้นต้นด้วยรูปกุญแจต้อง login (แนบ Bearer token จาก /auth/login)',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const port = Number(configService.getOrThrow<string>('PORT'));
  // ต้องระบุ 0.0.0.0 เอง - ถ้าปล่อย default บางเครื่อง (โดยเฉพาะ Windows) จะ bind แค่ IPv6
  // ทำให้ proxy ของ dev server ที่ต่อผ่าน 127.0.0.1 เจาะจงเจอ ECONNREFUSED
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`🎫 IT Ticket API is running on http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`📖 API docs available at http://localhost:${port}/api/docs`);
}
bootstrap();
