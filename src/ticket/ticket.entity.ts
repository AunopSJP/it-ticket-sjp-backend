import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('ticket_tb')
export class TicketEntity {
  @PrimaryGeneratedColumn({ name: 'ticket_id' })
  ticket_id!: number;

  @Column()
  ticket_name!: string;

  @Column()
  ticket_full_name!: string;

  @Column()
  ticket_contact_number!: string;

  @Column()
  ticket_location!: string;

  @CreateDateColumn({ name: 'ticket_create_date' })
  ticket_create_date!: Date;
}
