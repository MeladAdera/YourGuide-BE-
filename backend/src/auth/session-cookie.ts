import type { Response } from 'express';
import type { NewSession } from './auth.service.js';

export const SESSION_COOKIE = 'your_guide_session';

export function setSessionCookie(
  res: Response,
  session: NewSession,
  secure: boolean,
): void {
  res.cookie(SESSION_COOKIE, session.token, {
    // JavaScript in the page cannot read the cookie.
    httpOnly: true,
    // Sent over HTTPS only. Off in development, where we use http://localhost.
    secure,
    // Not sent on requests started by other websites (except plain links).
    sameSite: 'lax',
    expires: session.expiresAt,
    path: '/',
  });
}
