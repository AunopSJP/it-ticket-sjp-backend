import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_PASSWORD_CHANGE_KEY } from '../decorators/allow-password-change.decorator';
import { AdminTb } from '../../admin/admin.entity';

/** frontend ตรวจข้อความนี้เพื่อพาไปหน้าเปลี่ยนรหัสผ่าน - ห้ามเปลี่ยนโดยไม่แก้ auth.interceptor.ts */
export const PASSWORD_CHANGE_REQUIRED_MESSAGE = 'ต้องเปลี่ยนรหัสผ่านก่อนใช้งานระบบ (PASSWORD_CHANGE_REQUIRED)';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (!authenticated) return false;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = context.switchToHttp().getRequest<{ user?: AdminTb }>().user;
    if (user?.must_change_password && !allowed) {
      throw new ForbiddenException(PASSWORD_CHANGE_REQUIRED_MESSAGE);
    }
    return true;
  }
}
