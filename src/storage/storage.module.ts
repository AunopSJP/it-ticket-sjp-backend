import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { TicketStorageService } from './ticket-storage.service';
import { CloudinaryStorageService } from './cloudinary-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LocalStorageService, CloudinaryStorageService, TicketStorageService],
  exports: [LocalStorageService, CloudinaryStorageService, TicketStorageService],
})
export class StorageModule {}
