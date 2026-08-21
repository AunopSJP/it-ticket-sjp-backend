import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AdminModule } from './admin/admin.module';
import { TicketModule } from './ticket/ticket.module';
import { DepartmentModule } from './department/department.module';
import { NotificationModule } from './notification/notification.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [UserModule, AdminModule, TicketModule, DepartmentModule, NotificationModule, AuditModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
