import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfig } from '../config/app-config.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { setSessionCookie } from './session-cookie.js';
import { User } from './users.repository.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const { user, session } = await this.auth.register(dto);
    setSessionCookie(res, session, this.config.isProduction);
    return user;
  }
}
