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

// GET /auth/me is the first protected route, so these tests also cover
// the guard that every later route relies on.
describe('GET /api/auth/me', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let registered: Response;
  let token: string;

  function me(cookie?: string): Promise<Response> {
    const req = request(app.getHttpServer()).get('/api/auth/me');
    return cookie === undefined ? req : req.set('Cookie', cookie);
  }

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get(DatabaseService).pool;
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts with one account that is logged in.
  beforeEach(async () => {
    resetRateLimits(app);
    registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(USER);
    token = sessionToken(registered);
  });

  it('returns the logged-in user', async () => {
    const response = await me(cookieHeader(token));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(registered.body);
  });

  it('answers 401 without a cookie', async () => {
    const response = await me();

    expect(response.status).toBe(401);
  });

  it('answers 401 for a token that is not in the database', async () => {
    const response = await me(cookieHeader('not-a-real-token'));

    expect(response.status).toBe(401);
  });

  it('answers 401 after logout', async () => {
    expect((await me(cookieHeader(token))).status).toBe(200);

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader(token));

    expect((await me(cookieHeader(token))).status).toBe(401);
  });

  it('answers 401 when the session has expired', async () => {
    await pool.query(
      `UPDATE auth_sessions SET expires_at = now() - interval '1 second'`,
    );

    const response = await me(cookieHeader(token));

    expect(response.status).toBe(401);
  });

  it('answers 401, not 403, so the client knows to show the login page', async () => {
    const response = await me();

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ message: 'Not logged in.' });
  });
});
