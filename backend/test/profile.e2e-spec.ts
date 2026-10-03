import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import {
  ACHIEVEMENTS,
  BASICS,
  CONFIDENCE,
  PATTERNS,
  SELF_VIEW,
  SITUATION,
  VALUES,
} from './helpers/onboarding-answers.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { saveRequiredScreens } from './helpers/save-required-screens.js';
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
const TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;

/** Screens 2–7 as GET /api/profile returns them after saveRequiredScreens. */
const SAVED_SECTIONS = {
  basics: null,
  situation: { ...SITUATION, updatedAt: TIMESTAMP },
  achievements: { ...ACHIEVEMENTS, updatedAt: TIMESTAMP },
  patterns: { ...PATTERNS, updatedAt: TIMESTAMP },
  selfView: { ...SELF_VIEW, updatedAt: TIMESTAMP },
  confidence: { ...CONFIDENCE, updatedAt: TIMESTAMP },
  values: {
    ...VALUES,
    values: [
      { value: 'health', note: null },
      { value: 'independence', note: 'Deciding my own hours.' },
      { value: 'learning', note: 'The one thing nobody can take back.' },
    ],
    updatedAt: TIMESTAMP,
  },
};

interface ProfileBody {
  completedAt: string;
  updatedAt: string;
  sections: unknown;
}

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

  // Every test starts with one logged-in user who has saved screens 2–7
  // but not the direction: one step away from finishing onboarding.
  beforeEach(async () => {
    resetRateLimits(app);
    cookie = await registerAndGetCookie(USER.email);
    await saveRequiredScreens(app, cookie);
  });

  it('answers 404 before onboarding is complete', async () => {
    const response = await get();

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      message: 'Onboarding is not done yet.',
    });
  });

  it('saves the direction and returns the whole profile on the next get', async () => {
    const saved = await put(ANSWERS);

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      ...ANSWERS,
      firstOutcome: null,
      completedAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      sections: SAVED_SECTIONS,
    });
    expect((await get()).body).toEqual(saved.body);
  });

  it('includes basics once that optional screen is saved too', async () => {
    await request(app.getHttpServer())
      .put('/api/profile/sections/basics')
      .set('Cookie', cookie)
      .send(BASICS);

    const saved = await put(ANSWERS);

    expect((saved.body as ProfileBody).sections).toMatchObject({
      basics: { ...BASICS, updatedAt: TIMESTAMP },
    });
  });

  it('saves the optional first outcome and clears it when left out', async () => {
    const withOutcome = await put({
      ...ANSWERS,
      firstOutcome: 'One demo online.',
    });
    expect(withOutcome.body).toMatchObject({
      firstOutcome: 'One demo online.',
    });

    const without = await put(ANSWERS);

    expect(without.body).toMatchObject({ firstOutcome: null });
  });

  it('replaces the answers, moves updatedAt and keeps completedAt on a second put', async () => {
    const first = await put(ANSWERS);

    const second = await put({ ...ANSWERS, goal: 'Ship one product' });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ goal: 'Ship one product' });
    const before = first.body as ProfileBody;
    const after = second.body as ProfileBody;
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(
      new Date(before.updatedAt).getTime(),
    );
    expect(after.completedAt).toBe(before.completedAt);
    // Still one row: the second put updated, it did not add.
    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM profiles',
    );
    expect(rows[0]?.count).toBe(1);
  });

  it('refuses the direction with 409 until screens 2–7 are saved', async () => {
    const newCookie = await registerAndGetCookie('new@example.com');
    const putAsNew = (): Promise<Response> => put(ANSWERS, newCookie);

    const refused = await putAsNew();

    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Finish these screens first.',
      missing: [
        'situation',
        'achievements',
        'patterns',
        'selfView',
        'confidence',
        'values',
      ],
    });
    expect((await get(newCookie)).status).toBe(404);

    // One screen saved: still refused, and the list shrinks.
    await request(app.getHttpServer())
      .put('/api/profile/sections/situation')
      .set('Cookie', newCookie)
      .send(SITUATION);
    expect((await putAsNew()).body).toMatchObject({
      missing: ['achievements', 'patterns', 'selfView', 'confidence', 'values'],
    });

    // Basics is optional: saving it changes nothing here.
    await request(app.getHttpServer())
      .put('/api/profile/sections/basics')
      .set('Cookie', newCookie)
      .send(BASICS);
    expect((await putAsNew()).status).toBe(409);

    await saveRequiredScreens(app, newCookie);
    expect((await putAsNew()).status).toBe(200);
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
    [
      'a first outcome longer than 1000 characters',
      { ...ANSWERS, firstOutcome: 'a'.repeat(1001) },
    ],
    ['an unknown field', { ...ANSWERS, userId: 'someone-else' }],
  ])('rejects %s with 400 and saves nothing', async (_name, body) => {
    const response = await put(body);

    expect(response.status).toBe(400);
    expect((await get()).status).toBe(404);
  });
});
