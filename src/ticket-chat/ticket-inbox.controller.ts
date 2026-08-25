import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TicketChatService } from './ticket-chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';

@ApiTags('ticket-chat')
@Controller('ticket-chat')
export class TicketInboxController {
  constructor(private readonly chat: TicketChatService) {}

  @Get('inbox')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async inbox(@CurrentUser() admin: AdminTb) {
    return { items: await this.chat.getInbox(admin) };
  }
}
