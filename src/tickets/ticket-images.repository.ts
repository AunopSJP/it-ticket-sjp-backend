import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketImageTb } from './entities/ticket-image.entity';

@Injectable()
export class TicketImagesRepository {
  constructor(
    @InjectRepository(TicketImageTb)
    private readonly repo: Repository<TicketImageTb>,
  ) {}

  findByIdWithTicketHistory(ticket_image_id: number): Promise<TicketImageTb | null> {
    return this.repo.findOne({
      where: { ticket_image_id },
      relations: ['ticket', 'ticket.history'],
    });
  }
}
