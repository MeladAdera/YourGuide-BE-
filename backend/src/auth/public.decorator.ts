import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/**
 * Marks a route that works without a login. Every other route is closed by
 * the AuthGuard. "Closed" is the default on purpose: a forgotten @Public()
 * shows up as a 401, a forgotten guard would leak data silently.
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC, true);
