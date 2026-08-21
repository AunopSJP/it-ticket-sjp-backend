// schema: user_tb
// user_id
// user_line_user_id
// user_line_display_name
// user_line_picture_url
// user_create_date

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('user_tb')
export class UserEntity {
  @PrimaryGeneratedColumn({ name: 'user_id' })
  user_id!: number;

  @Column()
  user_line_user_id!: string;

  @Column()
  user_line_display_name!: string;

  @Column()
  user_line_picture_url!: string;

  @CreateDateColumn({ name: 'user_create_date' })
  user_create_date!: Date;
}
