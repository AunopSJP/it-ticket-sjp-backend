import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminTb } from '../admin/admin.entity';
import { THROTTLE_STRICT } from '../common/constants/throttle.constants';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { loginSchema } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}


  /** 5 ครั้ง/นาที ต่อ IP - ใช้คู่กับการล็อกบัญชีราย "อีเมล" ใน AuthService
   *  ซึ่งกันเคสคนร้ายกระจาย IP มาเดารหัสผ่านบัญชีเดียวได้ด้วย */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(THROTTLE_STRICT)
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AdminTb) {
    const { password: _password, ...safeUser } = user;
    return safeUser;
  }
}
