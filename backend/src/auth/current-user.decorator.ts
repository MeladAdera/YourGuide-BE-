import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** A request that passed the AuthGuard. The guard sets userId. */
export interface AuthenticatedRequest extends Request {
  userId: string;
}

/**
 * The id of the logged-in user: `me(@CurrentUser() userId: string)`.
 * Only for routes the guard protects.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { userId?: string }>();
    if (request.userId === undefined) {
      // A programming error, not a user error: @CurrentUser() on a @Public() route.
      throw new Error(
        '@CurrentUser() needs the AuthGuard. Is this route marked @Public()?',
      );
    }
    return request.userId;
  },
);
