import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SseConnectionLimiterService } from './sse-connection-limiter.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SseConnectionLimiterService],
  exports: [SseConnectionLimiterService],
})
export class SseModule {}
