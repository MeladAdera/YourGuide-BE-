import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppConfig } from '../config/app-config.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { User } from './dto/user.dto.js';
import { Public } from './public.decorator.js';
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from './session-cookie.js';

const RATE_LIMITED = 'More than 5 requests a minute from this IP address.';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  // Rate limited (5 per minute per IP, set in auth.module.ts): without it,
  // anyone could fill the database with accounts.
  @ApiOperation({ summary: 'Create an account and log in' })
  @ApiCreatedResponse({
    type: User,
    description: 'The new user. The response also sets the session cookie.',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid email, password shorter than 8, unknown timezone, a language the app does not have, or an unknown field.',
  })
  @ApiConflictResponse({
    description: 'An account with this email already exists.',
  })
  @ApiTooManyRequestsResponse({ description: RATE_LIMITED })
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
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({
    type: User,
    description: 'The user. The response also sets the session cookie.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid email, missing password, or an unknown field.',
  })
  @ApiUnauthorizedResponse({
    description: 'Wrong password or unknown email. Both give this answer.',
  })
  @ApiTooManyRequestsResponse({ description: RATE_LIMITED })
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
  @ApiOperation({ summary: 'End the session and clear the cookie' })
  @ApiNoContentResponse({
    description: 'Logged out. Also when there was no session to end.',
  })
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
  @ApiOperation({ summary: 'The logged-in user' })
  @ApiCookieAuth()
  @ApiOkResponse({ type: User })
  @ApiUnauthorizedResponse({
    description:
      'No session cookie, or the session has expired or was logged out.',
  })
  @Get('me')
  me(@CurrentUser() userId: string): Promise<User> {
    return this.auth.currentUser(userId);
  }

  // The language switch in the app. The frontend shows the new language at
  // once by itself; this call makes the choice follow the account, to
  // another browser and into the AI advice.
  @ApiOperation({ summary: 'Change the language the app shows you' })
  @ApiCookieAuth()
  @ApiOkResponse({
    type: User,
    description: 'The user, with the new language.',
  })
  @ApiBadRequestResponse({
    description: 'A language the app does not have, or an unknown field.',
  })
  @ApiUnauthorizedResponse({
    description:
      'No session cookie, or the session has expired or was logged out.',
  })
  @Patch('me')
  updateMe(
    @CurrentUser() userId: string,
    @Body() dto: UpdateMeDto,
  ): Promise<User> {
    return this.auth.updateMe(userId, dto);
  }
}
