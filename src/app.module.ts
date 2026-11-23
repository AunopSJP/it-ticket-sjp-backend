import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AuthModule } from "./auth/auth.module";
import { AdminsModule } from "./admin/admins.module";
import { DepartmentsModule } from "./departments/departments.module";
import { TicketsModule } from "./tickets/tickets.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { SymptomsModule } from "./symptoms/symptoms.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { StorageModule } from "./storage/storage.module";
import { AuditLogModule } from "./audit/audit-log.module";
import { LineModule } from "./line/line.module";
import { AdminTb } from "./admin/admin.entity";
import { DepartmentTb } from "./departments/department.entity";
import { TicketTb } from "./tickets/entities/ticket.entity";
import { TicketImageTb } from "./tickets/entities/ticket-image.entity";
import { TicketHistoryTb } from "./tickets/entities/ticket-history.entity";
import { SymptomSuggestionTb } from "./symptoms/symptom-suggestion.entity";
import { NotificationTb } from "./notifications/notification.entity";
import { UserTb } from "./users/user.entity";
import { UserNotificationTb } from "./notifications/user-notification.entity";
import { AuditLogTb } from "./audit/audit-log.entity";
import { TicketCommentTb } from "./tickets/entities/ticket-comment.entity";
import { TicketMessageTb } from "./tickets/entities/ticket-message.entity";
import { TicketAttachmentTb } from "./tickets/entities/ticket-attachment.entity";
import { TicketChatModule } from "./ticket-chat/ticket-chat.module";
import { SseModule } from "./common/sse/sse.module";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get("THROTTLE_TTL_SECONDS", 60)) * 1000,
          limit: Number(config.get("THROTTLE_LIMIT", 60)),
        },
      ],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.getOrThrow<string>("DB_HOST"),
        port: Number(config.getOrThrow<string>("DB_PORT")),
        username: config.getOrThrow<string>("DB_USERNAME"),
        password: config.getOrThrow<string>("DB_PASSWORD"),
        database: config.getOrThrow<string>("DB_NAME"),
        // ตั้ง DB_SSL=true เฉพาะตอนต่อ Postgres คนละเครื่องที่บังคับ SSL
        ssl:
          config.get<string>("DB_SSL", "false") === "true"
            ? { rejectUnauthorized: false }
            : false,
        // คอลัมน์ timestamp ในระบบนี้ไม่ใช่ timestamptz driver จึงตีความค่าตาม session timezone
        // ของ Postgres (ปกติ UTC) ไม่ใช่เวลาเครื่องที่รัน backend - ถ้าไม่บังคับตรงนี้ เวลาที่แสดง
        // จะเพี้ยนไป 7 ชม. เสมอ ไม่ว่านาฬิกาเครื่องจะถูกแค่ไหน
        extra: { options: `-c timezone=${config.getOrThrow<string>("DB_TIMEZONE")}` },
        entities: [
          AdminTb,
          DepartmentTb,
          TicketTb,
          TicketImageTb,
          TicketHistoryTb,
          SymptomSuggestionTb,
          NotificationTb,
          UserTb,
          UserNotificationTb,
          AuditLogTb,
          TicketCommentTb,
          TicketMessageTb,
          TicketAttachmentTb,
        ],
        // production ใช้ database/schema.sql สร้างตารางแทน - NODE_ENV=production บังคับปิด
        // synchronize เสมอไม่ว่า DB_SYNCHRONIZE จะเป็นอะไร กันเผลอ sync ทับตารางจริง
        synchronize:
          config.get<string>("NODE_ENV") !== "production" &&
          config.get<string>("DB_SYNCHRONIZE", "false") === "true",
      }),
    }),


    SseModule,
    StorageModule,
    AuditLogModule,
    LineModule,
    AuthModule,
    AdminsModule,
    DepartmentsModule,
    TicketsModule,
    DashboardModule,
    SymptomsModule,
    NotificationsModule,
    TicketChatModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
