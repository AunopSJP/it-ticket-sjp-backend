import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { TicketStorageService } from './ticket-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LocalStorageService, TicketStorageService],
  exports: [LocalStorageService, TicketStorageService],
})
export class StorageModule {}
