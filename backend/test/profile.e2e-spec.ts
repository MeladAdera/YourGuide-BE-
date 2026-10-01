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
const ANSWERS = {
  goal: 'Become a stronger full-stack developer',
  whyItMatters: 'I want to build my own products.',
  usualBlocker: 'I feel lost and switch to something easier.',
};

describe('/api/profile', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let cookie: string;

  async function registerAndGetCookie(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...USER, email });
    return cookieHeader(sessionToken(response));
  }

  // Pass null to send no cookie at all.
  function get(asCookie: string | null = cookie): Promise<Response> {
    const req = request(app.getHttpServer()).get('/api/profile');
    return asCookie === null ? req : req.set('Cookie', asCookie);
  }

  function put(body: object, asCookie = cookie): Promise<Response> {
    return request(app.getHttpServer())
      .put('/api/profile')
      .set('Cookie', asCookie)
      .send(body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get(DatabaseService).pool;
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts with one logged-in user who has no profile yet.
  beforeEach(async () => {
    resetRateLimits(app);
    cookie = await registerAndGetCookie(USER.email);
  });

  it('answers 404 before onboarding', async () => {
    const response = await get();

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      message: 'Onboarding is not done yet.',
    });
  });

  it('saves the answers and returns them on the next get', async () => {
    const saved = await put(ANSWERS);

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      ...ANSWERS,
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
    });
    expect((await get()).body).toEqual(saved.body);
  });

  it('replaces the answers and moves updatedAt on a second put', async () => {
    const first = await put(ANSWERS);

    const second = await put({ ...ANSWERS, goal: 'Ship one product' });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ goal: 'Ship one product' });
    const firstAt = new Date((first.body as { updatedAt: string }).updatedAt);
    const secondAt = new Date((second.body as { updatedAt: string }).updatedAt);
    expect(secondAt.getTime()).toBeGreaterThan(firstAt.getTime());
    // Still one row: the second put updated, it did not add.
    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM profiles',
    );
    expect(rows[0]?.count).toBe(1);
  });

  it('shows each user only their own profile', async () => {
    await put(ANSWERS);
    const otherCookie = await registerAndGetCookie('other@example.com');

    const response = await get(otherCookie);

    expect(response.status).toBe(404);
  });

  it('needs a login', async () => {
    expect((await get(null)).status).toBe(401);
    expect(
      (await request(app.getHttpServer()).put('/api/profile').send(ANSWERS))
        .status,
    ).toBe(401);
  });

  it.each([
    [
      'a missing answer',
      { goal: ANSWERS.goal, whyItMatters: ANSWERS.whyItMatters },
    ],
    ['an empty answer', { ...ANSWERS, usualBlocker: '' }],
    ['an answer that is not text', { ...ANSWERS, goal: 42 }],
    [
      'an answer longer than 1000 characters',
      { ...ANSWERS, goal: 'a'.repeat(1001) },
    ],
    ['an unknown field', { ...ANSWERS, userId: 'someone-else' }],
  ])('rejects %s with 400 and saves nothing', async (_name, body) => {
    const response = await put(body);

    expect(response.status).toBe(400);
    expect((await get()).status).toBe(404);
  });
});
