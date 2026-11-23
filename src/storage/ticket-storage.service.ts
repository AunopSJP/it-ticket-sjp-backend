import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { UploadedTicketImage } from './storage.shared';
import { CloudinaryStorageService } from './cloudinary-storage.service';

/**
 * เก็บไฟล์แนบตั๋วลง local disk ซึ่งเป็นที่เก็บจริงเพียงแห่งเดียว
 */
@Injectable()
export class TicketStorageService {
  private readonly provider: 'local' | 'cloudinary';

  constructor(
    private readonly local: LocalStorageService,
    private readonly cloudinary: CloudinaryStorageService,
    config: ConfigService,
  ) {
    const configured = config.get<string>('STORAGE_PROVIDER', 'local');
    this.provider = configured === 'cloudinary' ? 'cloudinary' : 'local';
  }

  uploadTicketImage(file: Express.Multer.File): Promise<UploadedTicketImage> {
    return this.provider === 'cloudinary' ? this.cloudinary.uploadTicketImage(file) : this.local.uploadTicketImage(file);
  }

  deleteTicketImage(file_name: string): Promise<void> {
    return this.provider === 'cloudinary' ? this.cloudinary.deleteTicketImage(file_name) : this.local.deleteTicketImage(file_name);
  }

  getContentType(file_name: string): string {
    return this.provider === 'cloudinary' ? this.cloudinary.getContentType(file_name) : this.local.getContentType(file_name);
  }

  getAbsolutePath(file_name: string): string {
    return this.local.getAbsolutePath(file_name);
  }

  getImage(file_name: string): Promise<Buffer> {
    return this.provider === 'cloudinary' ? this.cloudinary.getImage(file_name) : import('fs/promises').then(({ readFile }) => readFile(this.local.getAbsolutePath(file_name)));
  }
}
