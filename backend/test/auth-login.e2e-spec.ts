import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import {
  sessionCookie,
  sessionToken,
  tokenHash,
} from './helpers/session-cookie.js';

const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
};
const CREDENTIALS = { email: USER.email, password: USER.password };

describe('POST /api/auth/login', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let registered: Response;

  function login(body: object): Promise<Response> {
    return request(app.getHttpServer()).post('/api/auth/login').send(body);
  }

  async function sessionHashes(): Promise<string[]> {
    const { rows } = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM auth_sessions',
    );
    return rows.map((row) => row.token_hash);
  }

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get(DatabaseService).pool;
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts with one account, which has one session from register.
  beforeEach(async () => {
    resetRateLimits(app);
    registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(USER);
  });

  it('returns the user without the password', async () => {
    const response = await login(CREDENTIALS);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: (registered.body as { id: string }).id,
      email: USER.email,
      timezone: USER.timezone,
    });
  });

  it('sets an httpOnly session cookie', async () => {
    const response = await login(CREDENTIALS);

    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('creates a new session and stores only a hash of its token', async () => {
    const response = await login(CREDENTIALS);

    const oldToken = sessionToken(registered);
    const newToken = sessionToken(response);
    expect(newToken).not.toBe('');
    expect(newToken).not.toBe(oldToken);
    expect((await sessionHashes()).sort()).toEqual(
      [tokenHash(oldToken), tokenHash(newToken)].sort(),
    );
  });

  it('deletes the expired sessions of this user only', async () => {
    const other = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...USER, email: 'other@example.com' });
    await pool.query(
      `UPDATE auth_sessions SET expires_at = now() - interval '1 second'`,
    );

    const response = await login(CREDENTIALS);

    expect((await sessionHashes()).sort()).toEqual(
      [
        tokenHash(sessionToken(other)),
        tokenHash(sessionToken(response)),
      ].sort(),
    );
  });

  it('accepts the email in any letter case', async () => {
    const response = await login({
      ...CREDENTIALS,
      email: 'MELAD@Example.com',
    });

    expect(response.status).toBe(200);
  });

  it('rejects a wrong password with 401 and no session', async () => {
    const response = await login({
      ...CREDENTIALS,
      password: 'wrong password',
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: 'auth.invalid_credentials',
      message: 'Invalid email or password.',
    });
    expect(sessionCookie(response)).toBeUndefined();
    expect(await sessionHashes()).toHaveLength(1);
  });

  it('answers an unknown email exactly like a wrong password', async () => {
    const wrongPassword = await login({
      ...CREDENTIALS,
      password: 'wrong password',
    });

    const unknownEmail = await login({
      ...CREDENTIALS,
      email: 'nobody@example.com',
    });

    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(sessionCookie(unknownEmail)).toBeUndefined();
  });

  it.each([
    ['an invalid email', { ...CREDENTIALS, email: 'not-an-email' }],
    ['a missing password', { email: USER.email }],
    ['an empty password', { ...CREDENTIALS, password: '' }],
    [
      'a password longer than 128',
      { ...CREDENTIALS, password: 'a'.repeat(129) },
    ],
    ['an unknown field', { ...CREDENTIALS, isAdmin: true }],
  ])('rejects %s with 400', async (_name, body) => {
    const response = await login(body);

    expect(response.status).toBe(400);
    expect(await sessionHashes()).toHaveLength(1);
  });
});
