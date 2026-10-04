import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
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
import {
  REQUIRED_SCREEN_ANSWERS,
  saveRequiredScreens,
} from './helpers/save-required-screens.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
};
const TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;

/** The profile once screens 2–7 are saved and basics was skipped. */
const SAVED_PROFILE = {
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

describe('GET /api/profile', () => {
  let app: INestApplication<App>;
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

  function saveScreen(screen: string, answers: object): Promise<Response> {
    return request(app.getHttpServer())
      .put(`/api/profile/sections/${screen}`)
      .set('Cookie', cookie)
      .send(answers);
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts with one logged-in user who has saved nothing yet.
  beforeEach(async () => {
    resetRateLimits(app);
    cookie = await registerAndGetCookie(USER.email);
  });

  it('answers 404 before onboarding has started', async () => {
    const response = await get();

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'profile.onboarding_not_done',
      message: 'Onboarding is not done yet.',
    });
  });

  it('answers 404 while one required screen is still missing', async () => {
    // Everything except the last required screen, plus the optional one.
    for (const [screen, answers] of REQUIRED_SCREEN_ANSWERS.slice(0, -1)) {
      await saveScreen(screen, answers);
    }
    await saveScreen('basics', BASICS);

    expect((await get()).status).toBe(404);
  });

  it('returns the seven screens once the six required ones are saved', async () => {
    await saveRequiredScreens(app, cookie);

    const response = await get();

    expect(response.status).toBe(200);
    // Basics was skipped: the profile is complete without it.
    expect(response.body).toEqual(SAVED_PROFILE);
  });

  it('includes basics once that optional screen is saved too', async () => {
    await saveRequiredScreens(app, cookie);
    await saveScreen('basics', BASICS);

    expect((await get()).body).toEqual({
      ...SAVED_PROFILE,
      basics: { ...BASICS, updatedAt: TIMESTAMP },
    });
  });

  it('shows each user only their own profile', async () => {
    await saveRequiredScreens(app, cookie);
    const otherCookie = await registerAndGetCookie('other@example.com');

    expect((await get(otherCookie)).status).toBe(404);
  });

  it('needs a login', async () => {
    expect((await get(null)).status).toBe(401);
  });

  it('has no PUT any more: the direction it saved is a goal now', async () => {
    await saveRequiredScreens(app, cookie);

    const response = await request(app.getHttpServer())
      .put('/api/profile')
      .set('Cookie', cookie)
      .send({ goal: 'x', whyItMatters: 'y', usualBlocker: 'z' });

    expect(response.status).toBe(404);
  });
});
