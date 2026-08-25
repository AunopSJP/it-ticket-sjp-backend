import { BadRequestException, Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuditLogService } from './audit-log.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_STANDARD } from '../common/constants/throttle.constants';

@ApiTags('audit-log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Throttle(THROTTLE_STANDARD)
  list(@CurrentUser() admin: AdminTb, @Query('limit') limit?: string) {
    if (admin.department_id !== null) {
      throw new ForbiddenException('เฉพาะผู้ดูแลระบบ (super admin) เท่านั้นที่ดู audit log ได้');
    }
    const parsedLimit = limit === undefined ? 100 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 300) {
      throw new BadRequestException('limit ต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 300');
    }
    return this.auditLogService.list(parsedLimit);
  }
}
