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
    });
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

  it.each([
    ['an invalid email', { ...VALID, email: 'not-an-email' }],
    ['a password shorter than 8 characters', { ...VALID, password: 'short' }],
    ['a missing timezone', { email: VALID.email, password: VALID.password }],
    ['an unknown field', { ...VALID, isAdmin: true }],
  ])('rejects %s with 400', async (_name, body) => {
    const response = await register(body);

    expect(response.status).toBe(400);
    expect(await countUsers()).toBe(0);
  });
});
