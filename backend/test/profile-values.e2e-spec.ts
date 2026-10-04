import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { VALUES } from './helpers/onboarding-answers.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
  locale: 'en',
};
const ROUTE = '/api/profile/sections/values';
const UPDATED_AT = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;

// Screen 7 is the one screen that writes two tables (profile_meaning and
// profile_values), so it has its own tests instead of joining the
// describe.each in profile-sections.e2e-spec.ts.
describe('/api/profile/sections/values', () => {
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
    const req = request(app.getHttpServer()).get(ROUTE);
    return asCookie === null ? req : req.set('Cookie', asCookie);
  }

  function put(body: object, asCookie = cookie): Promise<Response> {
    return request(app.getHttpServer())
      .put(ROUTE)
      .set('Cookie', asCookie)
      .send(body);
  }

  async function rowCount(table: string): Promise<number | undefined> {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table}`,
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

  // Every test starts with one logged-in user who has saved nothing yet.
  beforeEach(async () => {
    resetRateLimits(app);
    cookie = await registerAndGetCookie(USER.email);
  });

  it('answers 404 before the screen is saved', async () => {
    const response = await get();

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'profile.screen_not_saved',
      message: 'This screen is not saved yet.',
    });
  });

  it('saves the answers and returns the picks in alphabetical order', async () => {
    const saved = await put(VALUES);

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      ...VALUES,
      // Sent as learning, health, independence; a set, so returned sorted,
      // with null for the note that was left out.
      values: [
        { value: 'health', note: null },
        { value: 'independence', note: 'Deciding my own hours.' },
        { value: 'learning', note: 'The one thing nobody can take back.' },
      ],
      updatedAt: UPDATED_AT,
    });
    expect((await get()).body).toEqual(saved.body);
  });

  it('returns null for every optional answer left out', async () => {
    const saved = await put({
      values: [{ value: 'family' }, { value: 'health' }],
      personToBecome: VALUES.personToBecome,
    });

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      values: [
        { value: 'family', note: null },
        { value: 'health', note: null },
      ],
      personToBecome: VALUES.personToBecome,
      wouldRegretNotDoing: null,
      rememberedFor: null,
      updatedAt: UPDATED_AT,
    });
  });

  it('replaces the whole set of picks on a second put', async () => {
    await put(VALUES);

    const second = await put({
      ...VALUES,
      values: [{ value: 'career' }, { value: 'creativity', note: 'Making.' }],
    });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      values: [
        { value: 'career', note: null },
        { value: 'creativity', note: 'Making.' },
      ],
    });
    // The old three picks are gone, and the free text still has one row.
    expect(await rowCount('profile_values')).toBe(2);
    expect(await rowCount('profile_meaning')).toBe(1);
  });

  it('shows each user only their own screen', async () => {
    await put(VALUES);
    const otherCookie = await registerAndGetCookie('other@example.com');

    expect((await get(otherCookie)).status).toBe(404);
  });

  it('needs a login', async () => {
    expect((await get(null)).status).toBe(401);
    expect(
      (await request(app.getHttpServer()).put(ROUTE).send(VALUES)).status,
    ).toBe(401);
  });

  it.each([
    ['one pick only', { ...VALUES, values: [{ value: 'health' }] }],
    [
      'six picks',
      {
        ...VALUES,
        values: [
          'family',
          'health',
          'career',
          'learning',
          'creativity',
          'contribution',
        ].map((value) => ({ value })),
      },
    ],
    [
      'the same value picked twice',
      { ...VALUES, values: [{ value: 'health' }, { value: 'health' }] },
    ],
    [
      'a value outside the list',
      { ...VALUES, values: [{ value: 'health' }, { value: 'fame' }] },
    ],
    [
      'a pick that is not an object',
      { ...VALUES, values: ['health', 'family'] },
    ],
    ['a pick that is null', { ...VALUES, values: [null, { value: 'health' }] }],
    [
      'a note longer than 300 characters',
      {
        ...VALUES,
        values: [
          { value: 'health', note: 'a'.repeat(301) },
          { value: 'family' },
        ],
      },
    ],
    [
      'an unknown field inside a pick',
      {
        ...VALUES,
        values: [{ value: 'health', rank: 1 }, { value: 'family' }],
      },
    ],
    ['a missing required answer', { values: VALUES.values }],
    ['an empty required answer', { ...VALUES, personToBecome: '' }],
    [
      'an answer longer than 1000 characters',
      { ...VALUES, rememberedFor: 'a'.repeat(1001) },
    ],
    ['an unknown field', { ...VALUES, userId: 'someone-else' }],
  ])('rejects %s with 400 and saves nothing', async (_name, body) => {
    const response = await put(body);

    expect(response.status).toBe(400);
    expect(await rowCount('profile_meaning')).toBe(0);
    expect(await rowCount('profile_values')).toBe(0);
  });

  it('says which pick, and which rule, when the body is refused', async () => {
    const response = await put({
      ...VALUES,
      values: [
        { value: 'health', note: 'a'.repeat(301) },
        { value: 'health', rank: 1 },
      ],
    });

    expect(response.status).toBe(400);
    // The rule of the list itself, then the fields inside it by position.
    expect(response.body).toMatchObject({
      code: 'validation.failed',
      message: [
        'Each value can be picked only once.',
        'values.0.note must be shorter than or equal to 300 characters',
        'values.1.property rank should not exist',
      ],
      errors: [
        { field: 'values', code: 'arrayUnique' },
        { field: 'values.0.note', code: 'maxLength' },
        { field: 'values.1.rank', code: 'whitelistValidation' },
      ],
    });
  });
});
