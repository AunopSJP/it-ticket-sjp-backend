import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketMessageTb } from '../tickets/entities/ticket-message.entity';
import { TicketTb } from '../tickets/entities/ticket.entity';
import { TicketChatService } from './ticket-chat.service';
import { TicketChatRepository } from './ticket-chat.repository';
import { AdminTb } from '../admin/admin.entity';
import { TicketChatController } from './ticket-chat.controller';
import { TicketInboxController } from './ticket-inbox.controller';
import { LineModule } from '../line/line.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TicketMessageTb, TicketTb, AdminTb]),
    LineModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [TicketChatController, TicketInboxController],
  providers: [TicketChatRepository, TicketChatService],
  exports: [TicketChatService],
})
export class TicketChatModule {}
