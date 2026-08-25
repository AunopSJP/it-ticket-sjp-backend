import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserTb } from './user.entity';
import { UserNotificationTb } from '../notifications/user-notification.entity';
import { UsersService } from './users.service';
import { UserNotificationsService } from './user-notifications.service';
import { UsersController } from './users.controller';
import { LineModule } from '../line/line.module';
import { UsersRepository } from './users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([UserTb, UserNotificationTb]), LineModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, UserNotificationsService],
  exports: [UsersService, UserNotificationsService],
})
export class UsersModule {}
