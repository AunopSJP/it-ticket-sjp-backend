import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_STANDARD } from '../common/constants/throttle.constants';

function parseOptionalDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} ต้องเป็นวันที่ที่ถูกต้อง`);
  }
  return date;
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Throttle(THROTTLE_STANDARD)
  summary(@CurrentUser() admin: AdminTb) {
    return this.dashboardService.summary(admin);
  }

  @Get('group-by')
  @Throttle(THROTTLE_STANDARD)
  groupBy(@Query('type') type: 'department' | 'assignee', @CurrentUser() admin: AdminTb) {
    if (type === 'department') {
      return this.dashboardService.groupByDepartment(admin);
    }
    if (type === 'assignee') {
      return this.dashboardService.groupByAssignee(admin);
    }
    throw new BadRequestException('type ต้องเป็น department หรือ assignee เท่านั้น');
  }

  @Get('analytics')
  @Throttle(THROTTLE_STANDARD)
  analytics(@CurrentUser() admin: AdminTb, @Query('from') from?: string, @Query('to') to?: string) {
    const parsedFrom = parseOptionalDate(from, 'from');
    const parsedTo = parseOptionalDate(to, 'to');
    if (parsedFrom && parsedTo && parsedFrom > parsedTo) {
      throw new BadRequestException('from ต้องไม่อยู่หลัง to');
    }
    return this.dashboardService.analytics(admin, parsedFrom, parsedTo);
  }

  @Get('trend')
  @Throttle(THROTTLE_STANDARD)
  trend(@CurrentUser() admin: AdminTb, @Query('from') from?: string, @Query('to') to?: string) {
    const parsedFrom = parseOptionalDate(from, 'from');
    const parsedTo = parseOptionalDate(to, 'to');
    if (parsedFrom && parsedTo && parsedFrom > parsedTo) {
      throw new BadRequestException('from ต้องไม่อยู่หลัง to');
    }
    return this.dashboardService.trend(admin, parsedFrom, parsedTo);
  }
}
