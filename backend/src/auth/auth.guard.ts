import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { DatabaseService } from '../database/database.service.js';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import { hashToken } from './auth.service.js';
import { AuthenticatedRequest } from './current-user.decorator.js';
import { IS_PUBLIC } from './public.decorator.js';
import { readSessionToken } from './session-cookie.js';

/**
 * Runs before every handler in the app (registered as APP_GUARD).
 * A route is open only when it is marked @Public(); every other route
 * needs a cookie with a live session.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
    private readonly authSessions: AuthSessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() can sit on one handler or on a whole controller.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionToken(request);
    const userId =
      token === undefined
        ? undefined
        : await this.authSessions.findUserIdByTokenHash(
            this.db.pool,
            hashToken(token),
          );
    if (userId === undefined) {
      // Thrown, not `return false`: a false from a guard becomes 403
      // Forbidden, and "not logged in" is 401.
      throw new UnauthorizedException('Not logged in.');
    }

    // Handlers read this through @CurrentUser().
    (request as AuthenticatedRequest).userId = userId;
    return true;
  }
}
