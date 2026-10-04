import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
};
const LIMIT = 5;

describe('rate limit on register and login', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let token: string;

  function login(password: string): Promise<Response> {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: USER.email, password });
  }

  function register(email: string): Promise<Response> {
    return request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...USER, email });
  }

  async function countSessions(): Promise<number | undefined> {
    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM auth_sessions',
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

  // Every test starts with a clean count and one registered account.
  beforeEach(async () => {
    resetRateLimits(app);
    token = sessionToken(await register(USER.email));
  });

  it('allows 5 login attempts a minute and refuses the 6th with 429', async () => {
    for (let attempt = 1; attempt <= LIMIT; attempt++) {
      expect((await login('wrong password')).status).toBe(401);
    }

    const sixth = await login('wrong password');

    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      code: 'rate_limited',
      message: 'Too many attempts. Try again in a minute.',
    });
    expect(sixth.get('Retry-After')).toBeDefined();
  });

  it('refuses the 6th attempt even when the password is correct', async () => {
    for (let attempt = 1; attempt <= LIMIT; attempt++) {
      await login('wrong password');
    }

    const sixth = await login(USER.password);

    expect(sixth.status).toBe(429);
    expect(sixth.get('Set-Cookie')).toBeUndefined();
    // Only the session from register exists: the 6th attempt was not checked.
    expect(await countSessions()).toBe(1);
  });

  it('limits register the same way', async () => {
    // The account in beforeEach was attempt 1.
    for (let attempt = 2; attempt <= LIMIT; attempt++) {
      const response = await register(`user${String(attempt)}@example.com`);

      expect(response.status).toBe(201);
    }

    const sixth = await register('user6@example.com');

    expect(sixth.status).toBe(429);
  });

  it('counts login and register separately', async () => {
    for (let attempt = 1; attempt <= LIMIT; attempt++) {
      await login('wrong password');
    }

    const response = await register('other@example.com');

    expect(response.status).toBe(201);
  });

  it('does not limit other routes', async () => {
    for (let attempt = 1; attempt <= LIMIT + 2; attempt++) {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookieHeader(token));

      expect(response.status).toBe(200);
    }
  });
});
