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

const VALID = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
  locale: 'en',
};

describe('POST /api/auth/register', () => {
  let app: INestApplication<App>;
  let pool: Pool;

  function register(body: object): Promise<Response> {
    return request(app.getHttpServer()).post('/api/auth/register').send(body);
  }

  async function countUsers(): Promise<number | undefined> {
    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users',
    );
    return rows[0]?.count;
  }

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get(DatabaseService).pool;
  });

  afterAll(async () => {
    await app.close();
  });

  // Register is rate limited (5 a minute), and this file registers more.
  beforeEach(() => {
    resetRateLimits(app);
  });

  it('creates the account and returns the user without the password', async () => {
    const response = await register(VALID);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      email: VALID.email,
      timezone: VALID.timezone,
      locale: VALID.locale,
    });
  });

  it('saves the language the browser sent', async () => {
    const response = await register({ ...VALID, locale: 'ar' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ locale: 'ar' });
    const { rows } = await pool.query<{ locale: string }>(
      'SELECT locale FROM users',
    );
    expect(rows).toEqual([{ locale: 'ar' }]);
  });

  it.each([
    ['a language the app does not have', { ...VALID, locale: 'fr' }],
    [
      'a missing language',
      {
        email: VALID.email,
        password: VALID.password,
        timezone: VALID.timezone,
      },
    ],
  ])('rejects %s with 400, naming the field', async (_name, body) => {
    const response = await register(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'validation.failed',
      errors: [{ field: 'locale', code: 'isIn' }],
    });
    expect(await countUsers()).toBe(0);
  });

  it('stores a hash of the password, never the password itself', async () => {
    await register(VALID);

    const { rows } = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0]?.password_hash).not.toContain(VALID.password);
  });

  it('logs the user in with an httpOnly cookie', async () => {
    const response = await register(VALID);

    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('stores only a hash of the session token', async () => {
    const response = await register(VALID);
    const token = sessionToken(response);

    const { rows } = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM auth_sessions',
    );
    expect(token).not.toBe('');
    expect(rows).toEqual([{ token_hash: tokenHash(token) }]);
  });

  it('rejects an email that is already registered with 409', async () => {
    await register(VALID);

    const response = await register({ ...VALID, password: 'another password' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'auth.email_taken',
      message: 'An account with this email already exists.',
    });
    expect(await countUsers()).toBe(1);
  });

  it('treats Foo@x.com and foo@x.com as the same email', async () => {
    await register({ ...VALID, email: 'foo@x.com' });

    const response = await register({ ...VALID, email: 'Foo@x.com' });

    expect(response.status).toBe(409);
  });

  it('rejects an invalid timezone with 400', async () => {
    const response = await register({ ...VALID, timezone: 'Mars/Olympus' });

    expect(response.status).toBe(400);
    expect(await countUsers()).toBe(0);
  });

  it('names the field and the rule when the body is refused', async () => {
    const response = await register({ ...VALID, password: 'short' });

    // `message` is English, for a developer. `errors` is what a client
    // translates: which field, which rule.
    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      code: 'validation.failed',
      message: ['password must be longer than or equal to 8 characters'],
      errors: [{ field: 'password', code: 'minLength' }],
    });
  });

  it('names every broken rule, and an unknown field too', async () => {
    const response = await register({
      ...VALID,
      email: 'not-an-email',
      timezone: 'Mars/Olympus',
      isAdmin: true,
    });

    expect((response.body as { errors: unknown }).errors).toEqual([
      { field: 'isAdmin', code: 'whitelistValidation' },
      { field: 'email', code: 'isEmail' },
      { field: 'timezone', code: 'isTimeZone' },
    ]);
  });

  it.each([
    ['an invalid email', { ...VALID, email: 'not-an-email' }],
    ['a password shorter than 8 characters', { ...VALID, password: 'short' }],
    [
      'a missing timezone',
      { email: VALID.email, password: VALID.password, locale: VALID.locale },
    ],
    ['an unknown field', { ...VALID, isAdmin: true }],
  ])('rejects %s with 400', async (_name, body) => {
    const response = await register(body);

    expect(response.status).toBe(400);
    expect(await countUsers()).toBe(0);
  });
});
