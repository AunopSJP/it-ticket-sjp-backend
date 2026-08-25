import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketTb } from '../tickets/entities/ticket.entity';
import { TicketHistoryTb } from '../tickets/entities/ticket-history.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TicketTb, TicketHistoryTb])],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
