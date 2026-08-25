import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminTb } from '../../admin/admin.entity';

export const CurrentUser = createParamDecorator(
  (data: keyof AdminTb | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AdminTb }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
