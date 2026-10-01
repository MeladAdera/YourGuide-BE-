import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfig } from '../config/app-config.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from './session-cookie.js';
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

  // 200, not the 201 that POST gives by default: login creates nothing the
  // client asked for by name, it only answers "yes, this is you".
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const { user, session } = await this.auth.login(dto);
    setSessionCookie(res, session, this.config.isProduction);
    return user;
  }

  // Always 204: with no cookie or an unknown token, the user is already
  // logged out, so there is nothing to refuse.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = readSessionToken(req);
    if (token !== undefined) {
      await this.auth.logout(token);
    }
    clearSessionCookie(res, this.config.isProduction);
  }
}
