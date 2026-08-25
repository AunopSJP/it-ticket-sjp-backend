import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DepartmentsService } from "./departments.service";
import { Throttle } from "@nestjs/throttler";
import { THROTTLE_STANDARD } from "../common/constants/throttle.constants";

/**
 * public ทั้งหมดเพราะฟอร์มแจ้งปัญหาต้องดึงรายชื่อแผนกไปแสดงตั้งแต่ยังไม่ login
 * ไม่มี POST เพิ่มแผนกแล้ว - ถ้าไม่เจอแผนกที่ต้องการให้เลือก "อื่นๆ" แล้วพิมพ์ชื่อเอง
 */
@ApiTags("departments")
@Controller("departments")
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Throttle(THROTTLE_STANDARD)
  findAll() {
    return this.departmentsService.findAll();
  }

  @Get(":id")
  @Throttle(THROTTLE_STANDARD)
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.departmentsService.findById(id);
  }
}
