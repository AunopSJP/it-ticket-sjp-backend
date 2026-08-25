import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TicketTb } from './ticket.entity';
import { AdminTb } from '../../admin/admin.entity';

@Entity('ticket_comment_tb')
export class TicketCommentTb {
  @PrimaryGeneratedColumn({ name: 'ticket_comment_id' })
  ticket_comment_id: number;

  @ManyToOne(() => TicketTb, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: TicketTb;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticket_id: string;

  @ManyToOne(() => AdminTb, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'admin_id' })
  admin: AdminTb | null;

  @Column({ name: 'admin_id', type: 'int', nullable: true })
  admin_id: number | null;

  @Column({ name: 'ticket_comment_note', type: 'text' })
  note: string;

  @Column({ name: 'ticket_comment_is_internal', default: true })
  is_internal: boolean;

  @CreateDateColumn({ name: 'ticket_comment_created_at' })
  created_at: Date;
}
