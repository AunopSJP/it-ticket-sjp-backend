import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LineVerifyService } from './line-verify.service';

/**
 * มีแค่ LineVerifyService (LINE Login channel ฟรีไม่จำกัด) - ไม่มี push message กลับผู้แจ้ง
 * เพราะ Messaging API จำกัดจำนวนข้อความ/เดือน แจ้งเตือนผู้แจ้งใช้ in-app แทน
 */
@Module({
  imports: [ConfigModule],
  providers: [LineVerifyService],
  exports: [LineVerifyService],
})
export class LineModule {}
