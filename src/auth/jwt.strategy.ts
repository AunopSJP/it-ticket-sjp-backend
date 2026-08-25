import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AdminsService } from '../admin/admins.service';

export interface JwtPayload {
  sub: number;
  email: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly adminsService: AdminsService,
  ) {
    super({
      // รองรับ 2 ทาง: Authorization: Bearer header (การเรียก REST ปกติ) และ query param ?token=
      // (จำเป็นสำหรับ EventSource/SSE ที่ฝั่งเบราว์เซอร์แนบ custom header เองไม่ได้)
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) =>
          typeof req?.path === 'string' && req.path.endsWith('/stream')
            ? req?.query?.token ?? null
            : null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.adminsService.findById(Number(payload.sub));
    if (!user || !user.is_active) {
      throw new UnauthorizedException('บัญชีผู้ใช้นี้ไม่สามารถใช้งานได้');
    }
    // การแก้ไขบัญชี/รีเซ็ตรหัสผ่านจะขยับ updated_at ทำให้ token เก่าถูกยกเลิก
    if (payload.iat && payload.iat < Math.floor(user.updated_at.getTime() / 1000)) {
      throw new UnauthorizedException('สิทธิ์เข้าสู่ระบบถูกเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่');
    }
    return user;
  }
}
