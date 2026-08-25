import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodTypeAny } from 'zod';

/**
 * Validation pipe แบบ Zod สำหรับ endpoint ที่ใช้ schema จาก @it-ticket/shared เป็น SSOT
 * ทุก body/query ที่รับจากภายนอกต้องผูก pipe นี้กับ schema ของ endpoint นั้น
 *
 * เฉพาะ metadata.type === 'body' เท่านั้นที่ validate - เดิมรวม 'custom' ไว้ด้วยเพราะคิดว่ามีแค่
 * decorator กำหนดเองที่ห่อ body แต่จริงๆ @UploadedFiles()/@UploadedFile() (จาก FilesInterceptor)
 * ก็เป็น metadata.type === 'custom' เหมือนกัน และ @UsePipes() ผูกกับทุก parameter ของ endpoint
 * ไม่ใช่แค่ตัวที่ต้องการ - ผลคือ pipe เอา array ของไฟล์ไป validate กับ schema ที่คาด object ทำให้
 * เจอ "Expected object, received array" ทุกครั้งที่ endpoint มีทั้ง body และ UploadedFiles พร้อมกัน
 * (เช่น POST /tickets ที่แนบรูปได้) ตัด 'custom' ออกจึงปลอดภัยกว่า เพราะ query ก็ validate ผ่าน
 * @Query() ซึ่งมี metadata.type เป็น 'query' อยู่แล้ว ไม่จำเป็นต้องพึ่ง 'custom'
 */
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // เฉพาะ body/query ที่ผูก schema นี้เท่านั้นที่ต้อง validate - params (เช่น :id) ใช้ ParseUUIDPipe ของตัวเองอยู่แล้ว
    // และ 'custom' (เช่น @UploadedFiles()) ต้องข้าม ไม่งั้นจะเอา array ของไฟล์ไป validate กับ schema ผิดตัว
    if (metadata.type !== 'body' && metadata.type !== 'query') {
      return value;
    }
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(formatZodError(result.error));
    }
    return result.data;
  }
}

/** รวม error message ของทุก field เป็น string เดียวให้ frontend แสดงผลได้สม่ำเสมอ */
function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join(', ');
}
