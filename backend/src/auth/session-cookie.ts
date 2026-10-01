import type { CookieOptions, Request, Response } from 'express';
import type { NewSession } from './auth.service.js';

export const SESSION_COOKIE = 'your_guide_session';

// Used to set the cookie and to clear it. A browser only removes a cookie
// when the clearing options match the ones it was set with.
function cookieOptions(secure: boolean): CookieOptions {
  return {
    // JavaScript in the page cannot read the cookie.
    httpOnly: true,
    // Sent over HTTPS only. Off in development, where we use http://localhost.
    secure,
    // Not sent on requests started by other websites (except plain links).
    sameSite: 'lax',
    path: '/',
  };
}

export function setSessionCookie(
  res: Response,
  session: NewSession,
  secure: boolean,
): void {
  res.cookie(SESSION_COOKIE, session.token, {
    ...cookieOptions(secure),
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(secure));
}

/** The token the browser sent, or undefined when there is no session cookie. */
export function readSessionToken(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown>;
  const token = cookies[SESSION_COOKIE];
  return typeof token === 'string' && token !== '' ? token : undefined;
}
