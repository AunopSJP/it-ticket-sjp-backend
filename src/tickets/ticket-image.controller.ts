import { Controller, Get, NotFoundException, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { LocalStorageService } from '../storage/local-storage.service';
import { TicketImageTb } from './entities/ticket-image.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';
import { assertTicketImageReadableByAdmin } from './ticket-access.policy';
import { TicketImagesRepository } from './ticket-images.repository';

@ApiTags('ticket-images')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets/images')
export class TicketImageController {
  constructor(
    private readonly images: TicketImagesRepository,
    private readonly storage: LocalStorageService,
  ) {}

  @Get(':id')
  async download(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: AdminTb, @Res() response: Response) {
    const image = await this.images.findByIdWithTicketHistory(id);
    if (!image) throw new NotFoundException('ไม่พบรูปแนบนี้');
    assertTicketImageReadableByAdmin(image.ticket, admin);
    response.setHeader('Content-Type', this.storage.getContentType(image.file_name));
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.sendFile(this.storage.getAbsolutePath(image.file_name));
  }
}
