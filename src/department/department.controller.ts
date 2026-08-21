// ไฟล์นี้คือ เปิด endpoint (GET list, POST สร้าง, PATCH แก้ไข) รับ request แล้วเรียก service

import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

@Controller('department')
export class DepartmentController {
  @Get()
  findAll() {
    return [];
  }

  @Post()
  create(@Body() body: Record<string, unknown>) {
    return {
      message: 'Department created successfully',
      data: body,
    };
  }

  @Patch(':department_id')
  update(
    @Param('department_id') department_id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return {
      message: 'Department updated successfully',
      department_id,
      data: body,
    };
  }
}
