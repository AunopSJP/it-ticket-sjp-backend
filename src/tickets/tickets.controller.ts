import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TicketsService } from './tickets.service';
import { CreateTicketDto, createTicketSchema } from './dto/create-ticket.dto';
import { AdminCreateTicketDto, adminCreateTicketSchema } from './dto/admin-create-ticket.dto';
import { ForwardTicketDto, forwardTicketSchema } from './dto/forward-ticket.dto';
import { ResolveTicketDto, resolveTicketSchema } from './dto/resolve-ticket.dto';
import { WaitTicketDto, waitTicketSchema } from './dto/wait-ticket.dto';
import { ConfirmResolutionDto, confirmResolutionSchema } from './dto/confirm-resolution.dto';
import { CreateTicketCommentDto, createTicketCommentSchema } from './dto/create-ticket-comment.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketPriority } from '../common/enums/ticket-priority.enum';
import { AdminTicketSort } from './tickets.service';
import { THROTTLE_STANDARD, THROTTLE_STRICT } from '../common/constants/throttle.constants';

function parsePositiveQueryInt(value: string | undefined, name: string, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new BadRequestException(`${name} ต้องเป็นจำนวนเต็มระหว่าง 1-${max}`);
  }
  return parsed;
}

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  /** สาธารณะ ไม่ต้อง login - จำกัด 5 ครั้ง/นาที เข้มกว่าปกติเพราะเขียนข้อมูล + อัปโหลดไฟล์ */
  @Post()
  @ApiConsumes('multipart/form-data')
  @Throttle(THROTTLE_STRICT)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 30, fieldSize: 64 * 1024 },
    }),
  )
  @UsePipes(new ZodValidationPipe(createTicketSchema))
  create(@Body() dto: CreateTicketDto, @UploadedFiles() files: Express.Multer.File[]) {
    // (Multer multipart form fields arrive as strings; createTicketSchema ใช้ z.coerce/preprocess จัดการ cast ให้)
    return this.ticketsService.create(dto, files);
  }

  /** แอดมิน login ด้วย JWT อยู่แล้ว สร้างตั๋วแทนผู้แจ้งที่ไม่ได้ใช้ LINE เอง (เช่น รับแจ้งทางโทรศัพท์)
   *  แยก endpoint จาก create() สาธารณะด้านบนเพราะไม่มี line_id_token/idempotency_key ให้ verify */
  @Post('admin-create')
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle(THROTTLE_STRICT)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 30, fieldSize: 64 * 1024 },
    }),
  )
  @UsePipes(new ZodValidationPipe(adminCreateTicketSchema))
  createByAdmin(
    @Body() dto: AdminCreateTicketDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() admin: AdminTb,
  ) {
    return this.ticketsService.createByAdmin(dto, files, admin);
  }

  /** สาธารณะ: แท็บ "ติดตามสถานะ" - ส่ง line_id_token มาด้วยจะได้ is_own_ticket ต่อรายการ
   *  ใช้ตัดสินใจว่าจะโชว์ปุ่ม "ยืนยันว่าแก้ไขแล้ว" ให้ตั๋วใบไหน (ดู searchPublic ใน service) */
  @Get('search')
  @Throttle(THROTTLE_STANDARD)
  search(@Query('keyword') keyword: string, @Query('line_id_token') line_id_token?: string) {
    return this.ticketsService.searchPublic(keyword, line_id_token);
  }

  @Get('mine')
  @Throttle(THROTTLE_STANDARD)
  findMine(@Query('line_id_token') line_id_token: string) {
    return this.ticketsService.findMineByLineUserId(line_id_token);
  }

  /** สาธารณะ: bubble "กำลังดำเนินการ" บนหน้าแจ้งปัญหา - ไม่มีข้อมูลส่วนตัวส่งออกไป */
  @Get('activity-feed')
  @Throttle(THROTTLE_STANDARD)
  getActivityFeed() {
    return this.ticketsService.getPublicActivityFeed();
  }

  /** สาธารณะแต่ต้องแนบ line_id_token ของผู้แจ้งตัวจริง - กันคนที่เดา ticket_id ได้
   *  มากดปิดตั๋วของคนอื่นแทน */
  @Patch(':id/confirm-resolution')
  @Throttle(THROTTLE_STANDARD)
  @UsePipes(new ZodValidationPipe(confirmResolutionSchema))
  confirmResolution(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmResolutionDto) {
    return this.ticketsService.confirmResolution(id, dto.line_id_token);
  }

  /** แอดมินแผนก (ไม่ใช่ super admin) ถูก force filter ให้เห็นเฉพาะแผนกตัวเองเสมอ */
  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  findAll(
    @CurrentUser() admin: AdminTb,
    @Query('status') status?: TicketStatus,
    @Query('department_id') department_id?: number,
    @Query('assignee_id') assignee_id?: string,
    @Query('keyword') keyword?: string,
    @Query('priority') priority?: TicketPriority,
    @Query('sort') sort?: AdminTicketSort,
    // 'true' เท่านั้นที่นับ - ใช้ตอนกดการ์ดสรุป "เกินกำหนด SLA" บนหน้า dashboard เพื่อดึงเฉพาะตั๋วที่ยัง
    // ไม่ปิดและเกินกำหนดอยู่จริงตอนนี้ (ไม่พึ่งพา filter.status เพราะ sla_breached ไม่ใช่ status)
    @Query('sla_breached_only') sla_breached_only?: string,
    // รูปแบบ YYYY-MM-DD จาก <input type="date"> ฝั่ง frontend - แปลงเป็นขอบเขตต้น/ท้ายวันที่นี่
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('page') pageQuery?: string,
    @Query('page_size') pageSizeQuery?: string,
  ) {
    const page = parsePositiveQueryInt(pageQuery, 'page', 1, 1_000_000);
    const page_size = parsePositiveQueryInt(pageSizeQuery, 'page_size', 30, 100);
    return this.ticketsService.findAllForAdmin(admin, {
      status,
      department_id: department_id !== undefined ? Number(department_id) : undefined,
      // "unassigned" คือค่าพิเศษจาก frontend ตอนกดแท่ง "ยังไม่มอบหมาย" (assignee_id เป็น null จริง ๆ ใน DB)
      assignee_id: assignee_id === undefined ? undefined : assignee_id === 'unassigned' ? null : Number(assignee_id),
      keyword,
      priority,
      sort,
      sla_breached_only: sla_breached_only === 'true',
      date_from: date_from ? new Date(`${date_from}T00:00:00`) : undefined,
      date_to: date_to ? new Date(`${date_to}T23:59:59.999`) : undefined,
    }, page, page_size);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AdminTb) {
    return this.ticketsService.findByIdForAdmin(id, admin);
  }

  @Get(':id/comments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  listComments(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AdminTb) {
    return this.ticketsService.listComments(id, admin);
  }

  @Post(':id/comments')
  @Throttle(THROTTLE_STANDARD)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ZodValidationPipe(createTicketCommentSchema))
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketCommentDto,
    @CurrentUser() admin: AdminTb,
  ) {
    return this.ticketsService.addComment(id, dto, admin);
  }

  /** ไม่มี body ให้แนบรูปด้วยไม่ได้ (assign ไม่มีฟิลด์ note ให้กรอกในฟอร์ม UI) - คงเป็น JSON endpoint เดิม */
  @Patch(':id/assign')
  @Throttle(THROTTLE_STRICT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body('assignee_id') assignee_id: number | undefined, @CurrentUser() admin: AdminTb) {
    return this.ticketsService.assign(id, admin, assignee_id ? Number(assignee_id) : undefined);
  }

  /** เปลี่ยนเป็น multipart/form-data เพื่อรองรับแนบรูปประกอบการดำเนินการ (ไม่บังคับ) - resolution_note
   *  ยังมาเป็น string เหมือนเดิม ไม่กระทบ resolveTicketSchema เพราะไม่มี field ที่ต้อง coerce ชนิด */
  @Patch(':id/resolve')
  @ApiConsumes('multipart/form-data')
  @Throttle(THROTTLE_STRICT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 30, fieldSize: 64 * 1024 },
    }),
  )
  @UsePipes(new ZodValidationPipe(resolveTicketSchema))
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveTicketDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() admin: AdminTb,
  ) {
    return this.ticketsService.resolve(id, dto, admin, files);
  }

  @Patch(':id/wait')
  @ApiConsumes('multipart/form-data')
  @Throttle(THROTTLE_STRICT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 30, fieldSize: 64 * 1024 },
    }),
  )
  @UsePipes(new ZodValidationPipe(waitTicketSchema))
  wait(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WaitTicketDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() admin: AdminTb,
  ) {
    return this.ticketsService.wait(id, dto, admin, files);
  }

  @Patch(':id/forward')
  @ApiConsumes('multipart/form-data')
  @Throttle(THROTTLE_STRICT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 30, fieldSize: 64 * 1024 },
    }),
  )
  @UsePipes(new ZodValidationPipe(forwardTicketSchema))
  forward(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForwardTicketDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() admin: AdminTb,
  ) {
    return this.ticketsService.forward(id, dto, admin, files);
  }
}
