import { createHash } from 'node:crypto';
import { Response } from 'supertest';

const SESSION_COOKIE = 'your_guide_session';

/** The Set-Cookie line of the session cookie, if the response has one. */
export function sessionCookie(response: Response): string | undefined {
  return response
    .get('Set-Cookie')
    ?.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

/** The token inside the session cookie, or '' when there is none. */
export function sessionToken(response: Response): string {
  return sessionCookie(response)?.split(';')[0]?.split('=')[1] ?? '';
}

/** The Cookie header a browser would send back for this token. */
export function cookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

/** What auth_sessions.token_hash must hold for this token. */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
