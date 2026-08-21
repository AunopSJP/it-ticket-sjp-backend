import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserEntity } from './user.entity';
import { Repository } from 'typeorm/browser/repository/Repository.js';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  //ฟังก์ชั่นเอาข้อมูลไลน์ที่ล็อคอินจากLIFF ไปเก็บในฐานข้อมูล
  async findUserByLineUserId(lineUserId: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { user_line_user_id: lineUserId },
    });
  }

  //ฟังก์ชั่นหาข้อมูลจาก user_line_user_id ไม่เจอสร้างใหม่ ถ้าเจออัฟเดตชื่อและรูปภาพ
  //เรียกเฉพาะตอนที่ผู้ใช้ล็อคอินผ่าน LIFF
  async createOrUpdateUser(
    lineUserId: string,
    displayName: string,
    pictureUrl: string,
  ): Promise<UserEntity> {
    const user = await this.findUserByLineUserId(lineUserId);

    if (user) {
      user.user_line_user_id = lineUserId;
      user.user_line_display_name = displayName;
      user.user_line_picture_url = pictureUrl;
      return this.userRepository.save(user);
    }

    return this.userRepository.save(
      this.userRepository.create({
        user_line_user_id: lineUserId,
        user_line_display_name: displayName,
        user_line_picture_url: pictureUrl,
      }),
    );
  }
}
