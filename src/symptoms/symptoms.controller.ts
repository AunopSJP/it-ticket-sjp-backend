import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SymptomsService } from './symptoms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_STANDARD, THROTTLE_STRICT } from '../common/constants/throttle.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';

@ApiTags('symptoms')
@Controller('departments/:department_id/symptoms')
export class SymptomsController {
  constructor(private readonly symptomsService: SymptomsService) {}

  @Get()
  @Throttle(THROTTLE_STANDARD)
  findQualified(@Param('department_id', ParseIntPipe) department_id: number) {
    return this.symptomsService.findQualifiedByDepartment(department_id);
  }

  @Post()
  @Throttle(THROTTLE_STRICT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  createManual(
    @Param('department_id', ParseIntPipe) department_id: number,
    @Body('label') label: string,
    @CurrentUser() admin: AdminTb,
  ) {
    if (admin.department_id !== null && admin.department_id !== department_id) {
      throw new ForbiddenException('แอดมินแผนกสามารถเพิ่มอาการได้เฉพาะแผนกของตนเอง');
    }
    return this.symptomsService.createManual(department_id, label);
  }
}
