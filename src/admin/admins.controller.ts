import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminsService } from './admins.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AdminTb } from './admin.entity';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_STANDARD, THROTTLE_STRICT } from '../common/constants/throttle.constants';
import {
  CreateAdminInput,
  ResetPasswordInput,
  SetActiveInput,
  UpdateDepartmentInput,
  UpdateProfileInput,
  createAdminSchema,
  resetPasswordSchema,
  setActiveSchema,
  updateDepartmentSchema,
  updateProfileSchema,
} from '@it-ticket/shared';

/**
 * จัดการบัญชีแอดมิน - ทุก endpoint ต้อง login และเกือบทั้งหมดจำกัดไว้เฉพาะ super admin
 * (department_id = null) โดยบังคับจริงที่ AdminsService ไม่ใช่ที่ guard
 * DTO validation ทั้งหมด migrate มาเป็น Zod schema จาก @it-ticket/shared แล้ว (SSOT เดียวกับ frontend)
 */
@ApiTags('admins')
@ApiBearerAuth()
@Controller('admins')
@UseGuards(JwtAuthGuard)
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  @Throttle(THROTTLE_STANDARD)
  findAll(@CurrentUser() requestingUser: AdminTb) {
    return this.adminsService.findAllForSuperAdmin(requestingUser);
  }

  /** แทนหน้าลงทะเบียนสาธารณะเดิม เพื่อไม่ให้ใครก็ได้สมัครเป็นแอดมินเอง */
  @Post()
  @Throttle(THROTTLE_STRICT)
  @UsePipes(new ZodValidationPipe(createAdminSchema))
  async create(@Body() dto: CreateAdminInput, @CurrentUser() requestingUser: AdminTb) {
    const created = await this.adminsService.createBySuperAdmin(dto, requestingUser);
    const { password: _password, ...safeUser } = created;
    return safeUser;
  }

  /** ปิด/เปิดบัญชีตัวเองไม่ได้ กันล็อกตัวเองออกจากระบบ */
  @Patch(':id/active')
  @Throttle(THROTTLE_STRICT)
  @UsePipes(new ZodValidationPipe(setActiveSchema))
  setActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetActiveInput,
    @CurrentUser() requestingUser: AdminTb,
  ) {
    return this.adminsService.setActive(id, dto.is_active, requestingUser);
  }

  @Patch(':id')
  @Throttle(THROTTLE_STRICT)
  @UsePipes(new ZodValidationPipe(updateProfileSchema))
  updateProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProfileInput,
    @CurrentUser() requestingUser: AdminTb,
  ) {
    return this.adminsService.updateProfile(id, dto.full_name, dto.email, requestingUser);
  }

  @Patch(':id/department')
  @Throttle(THROTTLE_STRICT)
  @UsePipes(new ZodValidationPipe(updateDepartmentSchema))
  updateDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentInput,
    @CurrentUser() requestingUser: AdminTb,
  ) {
    return this.adminsService.updateDepartment(id, dto.department_id ?? null, requestingUser);
  }

  /** ตั้งรหัสใหม่แทนการ "ดูรหัสเดิม" ซึ่งเป็นไปไม่ได้เพราะเก็บเป็น bcrypt hash ทางเดียว */
  @Patch(':id/password')
  @Throttle(THROTTLE_STRICT)
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordInput,
    @CurrentUser() requestingUser: AdminTb,
  ) {
    return this.adminsService.resetPassword(id, dto.new_password, requestingUser);
  }

  @Delete(':id')
  @Throttle(THROTTLE_STRICT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() requestingUser: AdminTb) {
    return this.adminsService.remove(id, requestingUser);
  }
}
