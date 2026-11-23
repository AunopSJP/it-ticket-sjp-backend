import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AdminsService } from "../admin/admins.service";
import { LoginDto } from "./dto/login.dto";
import { AdminTb } from "../admin/admin.entity";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Hash หลอกไว้เทียบเวลาไม่มีบัญชีจริงในระบบ (ไม่ใช่รหัสผ่านของใคร แค่ hash bcrypt เปล่าๆ)
   *
   * ป้องกัน timing attack แบบเดาอีเมลว่ามีอยู่จริงในระบบหรือไม่: ถ้า email ไม่พบแล้วข้าม
   * bcrypt.compare ไปเลย เวลาตอบจะเร็วกว่ากรณี "อีเมลถูกแต่รหัสผ่านผิด" อย่างสังเกตได้
   * (bcrypt.compare กินเวลาหลัก ms เพราะออกแบบมาให้ช้าโดยตั้งใจ) จึงต้องเทียบกับ hash
   * หลอกนี้เสมอเพื่อให้เวลาตอบใกล้เคียงกันไม่ว่าอีเมลจะมีอยู่จริงหรือไม่
   */
  private static readonly DUMMY_PASSWORD_HASH =
    "$2a$12$C6UzMDM.H6dfI/f/IKcEeOgUxCXjqQpekYZKXfPfk0GN6yLNH8yIe";

  /**
   * นับรหัสผ่านผิดแยกเป็นราย "อีเมล" ไม่ใช่ราย IP
   *
   * ThrottlerGuard จำกัดต่อ IP กันคนเดียวยิงรัวได้ แต่กันไม่ได้ถ้าคนร้ายกระจาย IP มาเดา
   * รหัสผ่านบัญชีเดียวกัน ตัวนับนี้มองจากฝั่งบัญชีที่ถูกโจมตีแทน จึงล็อกได้ไม่ว่ายิงมาจากที่ไหน
   *
   * ข้อจำกัด: เก็บใน memory - รีสตาร์ทแล้วหาย และนับแยกกันถ้าสเกลหลาย instance (ต้องย้ายไป Redis)
   */
  private readonly failedAttempts = new Map<
    string,
    { count: number; lockedUntil: number | null }
  >();

  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCK_DURATION_MS = 15 * 60 * 1000;

  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const accountKey = dto.username.trim().toLowerCase();
    this.assertNotLocked(accountKey);

    const user = await this.adminsService.findByUsernameWithPassword(dto.username);
    if (!user) {
      // นับรวมกรณีอีเมลไม่มีในระบบด้วย กันคนไล่เดาว่าอีเมลไหนมีอยู่จริงจากความเร็ว/พฤติกรรมที่ต่างกัน
      // ยังคงเรียก bcrypt.compare กับ hash หลอกเสมอ (ดู DUMMY_PASSWORD_HASH ด้านบน) แม้รู้ผลอยู่แล้วว่า
      // ไม่ผ่าน เพื่อให้เวลาตอบกลับใกล้เคียงกับกรณี "อีเมลถูกแต่รหัสผ่านผิด" ป้องกัน timing attack
      await this.adminsService.validatePassword(
        dto.password,
        AuthService.DUMMY_PASSWORD_HASH,
      );
      this.registerFailure(accountKey);
      throw new UnauthorizedException("เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง");
    }
    if (!user.is_active) {
      throw new UnauthorizedException(
        "บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
      );
    }

    const passwordValid = await this.adminsService.validatePassword(
      dto.password,
      user.password,
    );
    if (!passwordValid) {
      this.registerFailure(accountKey);
      throw new UnauthorizedException("เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง");
    }

    this.failedAttempts.delete(accountKey);

    return this.buildAuthResponse(user);
  }

  /** ออก token ใหม่หลังเปลี่ยนรหัสผ่าน - token เดิมถูกยกเลิกแล้วเพราะ updated_at ขยับ (ดู JwtStrategy) */
  issueSession(user: AdminTb) {
    return this.buildAuthResponse(user);
  }

  private assertNotLocked(accountKey: string): void {
    const record = this.failedAttempts.get(accountKey);
    if (!record?.lockedUntil) return;

    if (record.lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
      throw new UnauthorizedException(
        `ใส่รหัสผ่านผิดหลายครั้งเกินไป บัญชีนี้ถูกล็อกชั่วคราว กรุณาลองใหม่ในอีก ${minutesLeft} นาที`,
      );
    }

    this.failedAttempts.delete(accountKey);
  }

  private registerFailure(accountKey: string): void {
    const record = this.failedAttempts.get(accountKey) ?? {
      count: 0,
      lockedUntil: null,
    };
    record.count += 1;

    if (record.count >= AuthService.MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = Date.now() + AuthService.LOCK_DURATION_MS;
      record.count = 0;
      this.logger.warn(
        `ล็อกการ login ของบัญชี ${accountKey} ชั่วคราว 15 นาที (ใส่รหัสผ่านผิดครบ ${AuthService.MAX_FAILED_ATTEMPTS} ครั้ง)`,
      );
    }

    this.failedAttempts.set(accountKey, record);

    // กัน Map โตไม่มีเพดานถ้ามีคนยิงอีเมลมั่วๆ ไม่ซ้ำกันรัวๆ - ตัดตัวที่ใส่เข้ามาก่อนสุดทิ้ง
    if (this.failedAttempts.size > 10_000) {
      const oldest = this.failedAttempts.keys().next().value;
      if (oldest !== undefined) this.failedAttempts.delete(oldest);
    }
  }

  private buildAuthResponse(user: AdminTb) {
    const payload = { sub: user.admin_id, phone: user.phone };
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      // ชื่อ field ต้องตรงกับ AdminUser interface ฝั่ง frontend เป๊ะ
      user: {
        admin_id: user.admin_id,
        phone: user.phone,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        department_id: user.department_id,
        must_change_password: user.must_change_password,
      },
    };
  }
}
