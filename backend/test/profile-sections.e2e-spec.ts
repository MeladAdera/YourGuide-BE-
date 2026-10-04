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
} from './helpers/onboarding-answers.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
};

/** Everything the tests need to know about one screen. */
interface Screen {
  /** The last part of the route: /api/profile/sections/<path>. */
  path: string;
  table: string;
  /** Every answer, required and optional. */
  full: Record<string, unknown>;
  /** Only the required answers. */
  required: Record<string, unknown>;
  /** The answers that come back as null when left out. */
  optionalKeys: string[];
  /** A changed answer for the second put. */
  change: Record<string, unknown>;
  /** Bodies that must be refused with 400. */
  invalid: [string, Record<string, unknown>][];
}

const TOO_LONG = 'a'.repeat(1001);

const SCREENS: Screen[] = [
  {
    path: 'basics',
    table: 'profile_basics',
    full: BASICS,
    required: { employmentStatus: 'employed' },
    optionalKeys: [
      'ageRange',
      'country',
      'educationLevel',
      'occupation',
      'yearsExperience',
    ],
    change: { occupation: 'Teacher' },
    invalid: [
      ['a missing required answer', {}],
      ['an option outside its list', { employmentStatus: 'freelancer' }],
      ['a city instead of a country code', { ...BASICS, country: 'Dubai' }],
      ['an age outside its list', { ...BASICS, ageRange: '30' }],
      [
        'an occupation longer than 120 characters',
        { ...BASICS, occupation: 'a'.repeat(121) },
      ],
      ['an unknown field', { ...BASICS, userId: 'someone-else' }],
    ],
  },
  {
    path: 'situation',
    table: 'profile_situation',
    full: SITUATION,
    required: {
      typicalDay: SITUATION.typicalDay,
      wantToChange: SITUATION.wantToChange,
    },
    optionalKeys: ['satisfiedWith', 'wishMoreTimeFor'],
    change: { wantToChange: 'My mornings.' },
    invalid: [
      ['a missing required answer', { typicalDay: SITUATION.typicalDay }],
      ['an empty required answer', { ...SITUATION, typicalDay: '' }],
      ['an answer that is not text', { ...SITUATION, wantToChange: 42 }],
      [
        'an answer longer than 1000 characters',
        { ...SITUATION, satisfiedWith: TOO_LONG },
      ],
      ['an unknown field', { ...SITUATION, userId: 'someone-else' }],
    ],
  },
  {
    path: 'achievements',
    table: 'profile_achievements',
    full: ACHIEVEMENTS,
    required: { proudOf: ACHIEVEMENTS.proudOf },
    optionalKeys: ['whatWasHard', 'learnedAboutSelf'],
    change: { proudOf: 'I ran a half marathon.' },
    invalid: [
      ['a missing required answer', { whatWasHard: 'x' }],
      ['an empty required answer', { ...ACHIEVEMENTS, proudOf: '' }],
      [
        'an answer longer than 1000 characters',
        { ...ACHIEVEMENTS, proudOf: TOO_LONG },
      ],
      ['an unknown field', { ...ACHIEVEMENTS, userId: 'someone-else' }],
    ],
  },
  {
    path: 'patterns',
    table: 'profile_patterns',
    full: PATTERNS,
    required: { oftenPostpone: PATTERNS.oftenPostpone },
    optionalKeys: ['lessonFromMistake', 'patternToChange'],
    change: { oftenPostpone: 'Replying to messages.' },
    invalid: [
      ['a missing required answer', { patternToChange: 'x' }],
      ['an empty required answer', { ...PATTERNS, oftenPostpone: '' }],
      [
        'an answer longer than 1000 characters',
        { ...PATTERNS, lessonFromMistake: TOO_LONG },
      ],
      ['an unknown field', { ...PATTERNS, userId: 'someone-else' }],
    ],
  },
  {
    path: 'self-view',
    table: 'profile_self_view',
    full: SELF_VIEW,
    required: { whoIAm: SELF_VIEW.whoIAm },
    optionalKeys: ['goodAt', 'othersComeToMeFor', 'stillFiguringOut'],
    change: { goodAt: 'Listening.' },
    invalid: [
      ['a missing required answer', { goodAt: 'x' }],
      ['an empty required answer', { ...SELF_VIEW, whoIAm: '' }],
      [
        'a self-description longer than 3000 characters',
        { ...SELF_VIEW, whoIAm: 'a'.repeat(3001) },
      ],
      [
        'an answer longer than 1000 characters',
        { ...SELF_VIEW, goodAt: TOO_LONG },
      ],
      ['an unknown field', { ...SELF_VIEW, userId: 'someone-else' }],
    ],
  },
  {
    path: 'confidence',
    table: 'profile_confidence',
    full: CONFIDENCE,
    required: CONFIDENCE,
    optionalKeys: [],
    change: { followThrough: 4 },
    invalid: [
      // JSON drops an undefined key, so the body simply lacks this answer.
      ['a missing answer', { ...CONFIDENCE, compareTooMuch: undefined }],
      ['an answer below 1', { ...CONFIDENCE, canTryAgain: 0 }],
      ['an answer above 5', { ...CONFIDENCE, canTryAgain: 6 }],
      [
        'an answer that is not a whole number',
        { ...CONFIDENCE, canTryAgain: 2.5 },
      ],
      [
        'an answer that is not a number',
        { ...CONFIDENCE, canTryAgain: 'four' },
      ],
      ['an unknown field', { ...CONFIDENCE, total: 28 }],
    ],
  },
];

describe.each(SCREENS)('/api/profile/sections/$path', (screen) => {
  const route = `/api/profile/sections/${screen.path}`;
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
    const req = request(app.getHttpServer()).get(route);
    return asCookie === null ? req : req.set('Cookie', asCookie);
  }

  function put(body: object, asCookie = cookie): Promise<Response> {
    return request(app.getHttpServer())
      .put(route)
      .set('Cookie', asCookie)
      .send(body);
  }

  async function rowCount(): Promise<number | undefined> {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${screen.table}`,
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

  it('saves the answers and returns them on the next get', async () => {
    const saved = await put(screen.full);

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      ...screen.full,
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
    });
    expect((await get()).body).toEqual(saved.body);
  });

  it('returns null for every optional answer left out', async () => {
    const saved = await put(screen.required);

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      ...screen.required,
      ...Object.fromEntries(screen.optionalKeys.map((key) => [key, null])),
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
    });
  });

  it('replaces the answers on a second put and keeps one row', async () => {
    await put(screen.full);

    const second = await put({ ...screen.full, ...screen.change });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject(screen.change);
    expect((await get()).body).toMatchObject(screen.change);
    expect(await rowCount()).toBe(1);
  });

  it('clears an optional answer that a later put leaves out', async () => {
    await put(screen.full);

    const second = await put(screen.required);

    expect(second.status).toBe(200);
    for (const key of screen.optionalKeys) {
      expect(second.body).toHaveProperty(key, null);
    }
  });

  it('shows each user only their own screen', async () => {
    await put(screen.full);
    const otherCookie = await registerAndGetCookie('other@example.com');

    expect((await get(otherCookie)).status).toBe(404);
  });

  it('needs a login', async () => {
    expect((await get(null)).status).toBe(401);
    expect(
      (await request(app.getHttpServer()).put(route).send(screen.full)).status,
    ).toBe(401);
  });

  it.each(screen.invalid)(
    'rejects %s with 400 and saves nothing',
    async (_name, body) => {
      const response = await put(body);

      expect(response.status).toBe(400);
      expect(await rowCount()).toBe(0);
    },
  );
});
