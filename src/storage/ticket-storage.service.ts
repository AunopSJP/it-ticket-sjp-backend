import { Injectable } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { UploadedTicketImage } from './storage.shared';

/**
 * เก็บไฟล์แนบตั๋วลง local disk ซึ่งเป็นที่เก็บจริงเพียงแห่งเดียว
 */
@Injectable()
export class TicketStorageService {
  constructor(private readonly local: LocalStorageService) {}

  uploadTicketImage(file: Express.Multer.File): Promise<UploadedTicketImage> {
    return this.local.uploadTicketImage(file);
  }

  deleteTicketImage(file_name: string): Promise<void> {
    return this.local.deleteTicketImage(file_name);
  }
}
