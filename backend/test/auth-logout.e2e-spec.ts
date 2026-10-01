import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import {
  cookieHeader,
  sessionCookie,
  sessionToken,
  tokenHash,
} from './helpers/session-cookie.js';

const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
};

describe('POST /api/auth/logout', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let token: string;

  function logout(cookie?: string): Promise<Response> {
    const req = request(app.getHttpServer()).post('/api/auth/logout');
    return cookie === undefined ? req : req.set('Cookie', cookie);
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

  // Every test starts with one account that is logged in.
  beforeEach(async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(USER);
    token = sessionToken(registered);
  });

  it('deletes the session from the database', async () => {
    const response = await logout(cookieHeader(token));

    expect(response.status).toBe(204);
    expect(await sessionHashes()).toEqual([]);
  });

  it('tells the browser to remove the cookie', async () => {
    const response = await logout(cookieHeader(token));

    const cookie = sessionCookie(response);
    expect(cookie).toContain('your_guide_session=;');
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookie).toContain('Path=/');
  });

  it('ends only the session of this cookie', async () => {
    const secondLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: USER.email, password: USER.password });
    const otherToken = sessionToken(secondLogin);

    await logout(cookieHeader(token));

    expect(await sessionHashes()).toEqual([tokenHash(otherToken)]);
  });

  it('answers 204 when there is no cookie', async () => {
    const response = await logout();

    expect(response.status).toBe(204);
    expect(await sessionHashes()).toEqual([tokenHash(token)]);
  });

  it('answers 204 for a token that does not exist', async () => {
    const response = await logout(cookieHeader('not-a-real-token'));

    expect(response.status).toBe(204);
    expect(await sessionHashes()).toEqual([tokenHash(token)]);
  });
});
