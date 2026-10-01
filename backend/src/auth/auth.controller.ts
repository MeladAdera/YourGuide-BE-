import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppConfig } from '../config/app-config.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { Public } from './public.decorator.js';
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

  // Rate limited (5 per minute per IP, set in auth.module.ts): without it,
  // anyone could fill the database with accounts.
  @Public()
  @UseGuards(ThrottlerGuard)
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
  // Rate limited: 5 password guesses a minute, instead of thousands.
  @Public()
  @UseGuards(ThrottlerGuard)
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

  // Public and always 204: with no cookie, an expired session or an unknown
  // token, the user is already logged out, so there is nothing to refuse.
  // A browser with a stale cookie must still be able to clear it.
  @Public()
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

  // Not @Public(): the guard has already checked the cookie when this runs.
  @Get('me')
  me(@CurrentUser() userId: string): Promise<User> {
    return this.auth.currentUser(userId);
  }
}
