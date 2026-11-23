import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';
import { UploadedTicketImage, detectImageTypeOrThrow, mimeFromExt } from './storage.shared';

@Injectable()
export class CloudinaryStorageService {
  constructor(config: ConfigService) {
    cloudinary.config({ cloud_name: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'), api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'), api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'), secure: true });
  }

  async uploadTicketImage(file: Express.Multer.File): Promise<UploadedTicketImage> {
    const detected = detectImageTypeOrThrow(file.buffer);
    const public_id = `tickets/${randomUUID()}`;
    const uploaded = await new Promise<{ public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ public_id, resource_type: 'image', type: 'authenticated', format: detected.ext.slice(1) }, (error, result) => error || !result ? reject(error ?? new Error('Cloudinary upload failed')) : resolve(result));
      stream.end(file.buffer);
    });
    return { file_name: `${uploaded.public_id}${detected.ext}`, public_url: `/api/tickets/images/${encodeURIComponent(uploaded.public_id)}` };
  }

  async getImage(file_name: string): Promise<Buffer> {
    const public_id = file_name.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
    const url = cloudinary.url(public_id, { resource_type: 'image', type: 'authenticated', sign_url: true, secure: true });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cloudinary download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async deleteTicketImage(file_name: string): Promise<void> {
    const public_id = file_name.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
    await cloudinary.uploader.destroy(public_id, { resource_type: 'image', type: 'authenticated', invalidate: true });
  }

  getContentType(file_name: string): string {
    return mimeFromExt(`.${file_name.toLowerCase().split('.').pop() ?? ''}`);
  }
}
