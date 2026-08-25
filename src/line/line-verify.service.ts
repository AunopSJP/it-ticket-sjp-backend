import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { z } from 'zod';

const lineVerifyResponseSchema = z.object({
  iss: z.string(),
  sub: z.string().min(1),
  aud: z.string(),
  exp: z.number().int(),
  iat: z.number().int(),
  auth_time: z.number().int().optional(),
  nonce: z.string().optional(),
  amr: z.array(z.string()).optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
  email: z.string().email().optional(),
});
type LineVerifyResponse = z.infer<typeof lineVerifyResponseSchema>;
export type LineIdTokenPayload = Pick<LineVerifyResponse, 'sub' | 'exp' | 'name' | 'picture' | 'email'>;

/** ติดต่อ LINE ไม่สำเร็จชั่วคราว (network/timeout) - ไม่ใช่ "token ผิด" จึงห้าม cache ผลไว้ */
class LineVerifyTransientError extends Error {
  constructor() {
    super("ติดต่อ LINE เพื่อตรวจสอบ ID token ไม่สำเร็จ");
  }
}

/**
 * ตรวจ ID token จาก liff.getIDToken() กับ LINE server ทุกครั้ง ไม่เชื่อ line_user_id ที่ client
 * ส่งมาตรงๆ - กันปลอม userId มาสวมรอยดู PII / ปิดงาน / ให้คะแนนแทนคนอื่น
 */
@Injectable()
export class LineVerifyService {
  private readonly logger = new Logger(LineVerifyService.name);
  private readonly channelId: string;

  /**
   * cache ผล verify กันยิง LINE API ซ้ำด้วย token เดิม
   *
   * ทุก endpoint ฝั่งผู้แจ้งแนบ line_id_token มาทุก request ถ้าไม่ cache แล้วมีคนยิงถล่ม 1000 req
   * จะกลายเป็น 1000 outbound call ค้างพร้อมกัน กิน socket จนหมดและเสี่ยงโดน LINE rate limit
   * ทั้ง channel จนผู้ใช้จริง login ไม่ได้ (คนร้ายจ่ายถูก เราจ่ายแพง)
   *
   * เก็บเป็น hash ของ token ไม่เก็บ token ดิบ เผื่อ heap dump/log หลุด
   */
  private readonly cache = new Map<string, { payload: LineIdTokenPayload; expiresAt: number }>();
  /** จำ token ที่ verify ไม่ผ่านไว้ด้วย (TTL สั้นกว่า) - กันคนยิง token มั่วๆ ซ้ำๆ ให้เราไปถาม LINE ทุกครั้ง */
  private readonly negativeCache = new Map<string, number>();
  /** dedupe request ที่ token เดียวกันและกำลังรอผลอยู่พร้อมกัน ให้ยิงออกไปจริงแค่ครั้งเดียว */
  private readonly inFlight = new Map<string, Promise<LineIdTokenPayload>>();

  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private static readonly NEGATIVE_CACHE_TTL_MS = 60 * 1000;
  /** เพดานจำนวนรายการใน cache กันหน่วยความจำโตไม่จำกัดถ้ามีคนยิง token ไม่ซ้ำกันรัวๆ */
  private static readonly MAX_CACHE_ENTRIES = 5_000;
  /** endpoint ตรวจสอบ ID token ของ LINE Login (ทางการจาก LINE - ไม่เปลี่ยนบ่อย แต่ตั้งชื่อไว้กันพิมพ์ผิด/ซ้ำ) */
  private static readonly LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";

  constructor(private readonly config: ConfigService) {
    this.channelId = this.config.get<string>("LINE_LOGIN_CHANNEL_ID") || "";
  }

  isConfigured(): boolean {
    return !!this.channelId;
  }

  private cacheKey(idToken: string): string {
    return createHash("sha256").update(idToken).digest("base64");
  }

  /** ตัดรายการที่หมดอายุทิ้ง และถ้ายังเกินเพดานให้ตัดตัวที่ใส่เข้ามาก่อนสุดออก (Map เรียงตามลำดับใส่อยู่แล้ว) */
  private evictIfNeeded(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
    for (const [key, expiresAt] of this.negativeCache) {
      if (expiresAt <= now) this.negativeCache.delete(key);
    }
    while (this.cache.size > LineVerifyService.MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    while (this.negativeCache.size > LineVerifyService.MAX_CACHE_ENTRIES) {
      const oldest = this.negativeCache.keys().next().value;
      if (oldest === undefined) break;
      this.negativeCache.delete(oldest);
    }
  }

  async verifyIdToken(idToken: string): Promise<LineIdTokenPayload> {
    if (!idToken) {
      throw new UnauthorizedException("ไม่ได้แนบ ID token ของ LINE มาด้วย");
    }

    const key = this.cacheKey(idToken);
    const now = Date.now();

    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const negativeUntil = this.negativeCache.get(key);
    if (negativeUntil !== undefined && negativeUntil > now) {
      throw new UnauthorizedException("ID token ของ LINE ไม่ถูกต้องหรือหมดอายุ");
    }

    // มี request อื่นถาม LINE ด้วย token เดียวกันค้างอยู่แล้ว - รอผลอันเดียวกันไปเลย ไม่ยิงซ้ำ
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = this.verifyWithLine(idToken)
      .then((payload) => {
        const tokenExpiresAt = payload.exp * 1000;
        if (tokenExpiresAt <= Date.now()) {
          throw new UnauthorizedException("ID token ของ LINE หมดอายุแล้ว");
        }
        this.cache.set(key, {
          payload,
          expiresAt: Math.min(Date.now() + LineVerifyService.CACHE_TTL_MS, tokenExpiresAt),
        });
        this.evictIfNeeded();
        return payload;
      })
      .catch((err: unknown) => {
        if (err instanceof LineVerifyTransientError) {
          // ติดต่อ LINE ไม่ได้ชั่วคราว - ไม่ cache ไว้ ไม่งั้น LINE สะดุดแป๊บเดียวจะทำให้ผู้ใช้จริง
          // ถูกปฏิเสธยาวเกินจำเป็น แล้วแปลงเป็น 401 ให้ผู้เรียกเหมือนเดิมเพื่อไม่ให้ behavior เปลี่ยน
          throw new UnauthorizedException("ตรวจสอบสิทธิ์ LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        }
        // เฉพาะกรณี "token ใช้ไม่ได้จริง" เท่านั้นที่จำไว้ กันคนยิง token มั่วซ้ำๆ
        this.negativeCache.set(key, Date.now() + LineVerifyService.NEGATIVE_CACHE_TTL_MS);
        this.evictIfNeeded();
        throw err;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  private async verifyWithLine(idToken: string): Promise<LineIdTokenPayload> {
    if (!this.channelId) {
      this.logger.error("ยังไม่ได้ตั้งค่า LINE_LOGIN_CHANNEL_ID ใน .env");
      throw new UnauthorizedException("ระบบ LINE Login ยังไม่พร้อมใช้งาน");
    }

    try {
      // ใส่ timeout กันไว้ - ถ้า LINE API ค้าง จะบล็อก request ของผู้ใช้ไม่มีกำหนด
      // ตั้ง 5 วิ (เดิม 10) เพื่อคืน socket ให้เร็วขึ้นตอนโดนยิงถล่ม - LINE ปกติตอบในหลักร้อย ms
      const res = await fetch(LineVerifyService.LINE_VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: this.channelId, // ให้ LINE เช็กให้เลยว่า token นี้สร้างมาจาก channel ID ของเราจริงไหม
        }),
        signal: AbortSignal.timeout(5_000),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        this.logger.warn(`LINE verification failed: ${JSON.stringify(data)}`);
        throw new UnauthorizedException("ID token ของ LINE ไม่ถูกต้องหรือหมดอายุ");
      }

      const parsed = lineVerifyResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new UnauthorizedException("ข้อมูลยืนยันตัวตนจาก LINE ไม่ถูกต้อง");
      }
      const verifiedData: LineVerifyResponse = parsed.data;

      return {
        sub: verifiedData.sub,
        exp: verifiedData.exp,
        name: verifiedData.name,
        picture: verifiedData.picture,
        email: verifiedData.email,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;

      // ติดต่อ LINE ไม่ได้ชั่วคราว (network/timeout) - คนละเรื่องกับ "token ใช้ไม่ได้"
      // แยก type ไว้ให้ verifyIdToken() รู้ว่าห้ามเอาไปใส่ negative cache
      this.logger.error(
        "ติดต่อ LINE เพื่อตรวจสอบ ID token ไม่สำเร็จ:",
        err instanceof Error ? err.stack ?? err.message : String(err),
      );
      throw new LineVerifyTransientError();
    }
  }
}
