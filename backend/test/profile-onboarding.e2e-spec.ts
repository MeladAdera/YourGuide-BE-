import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './helpers/create-test-app.js';
import { BASICS, SITUATION } from './helpers/onboarding-answers.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { saveRequiredScreens } from './helpers/save-required-screens.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
};
const NOTHING_SAVED = {
  completed: false,
  screens: {
    basics: false,
    situation: false,
    achievements: false,
    patterns: false,
    selfView: false,
    confidence: false,
    values: false,
  },
  missing: [
    'situation',
    'achievements',
    'patterns',
    'selfView',
    'confidence',
    'values',
  ],
};

describe('GET /api/profile/onboarding', () => {
  let app: INestApplication<App>;
  let cookie: string;

  async function registerAndGetCookie(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...USER, email });
    return cookieHeader(sessionToken(response));
  }

  // Pass null to send no cookie at all.
  function status(asCookie: string | null = cookie): Promise<Response> {
    const req = request(app.getHttpServer()).get('/api/profile/onboarding');
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

  beforeEach(async () => {
    resetRateLimits(app);
    cookie = await registerAndGetCookie(USER.email);
  });

  it('starts with nothing saved, and is never 404', async () => {
    const response = await status();

    expect(response.status).toBe(200);
    expect(response.body).toEqual(NOTHING_SAVED);
  });

  it('reports each screen as it is saved', async () => {
    await saveScreen('basics', BASICS);
    await saveScreen('situation', SITUATION);

    const response = await status();

    expect(response.body).toEqual({
      completed: false,
      screens: { ...NOTHING_SAVED.screens, basics: true, situation: true },
      // Basics was never required, so saving it changes nothing here.
      missing: ['achievements', 'patterns', 'selfView', 'confidence', 'values'],
    });
  });

  it('is complete once the six required screens are saved', async () => {
    await saveRequiredScreens(app, cookie);

    expect((await status()).body).toEqual({
      completed: true,
      screens: {
        basics: false,
        situation: true,
        achievements: true,
        patterns: true,
        selfView: true,
        confidence: true,
        values: true,
      },
      missing: [],
    });
  });

  it('shows each user only their own progress', async () => {
    await saveScreen('situation', SITUATION);
    const otherCookie = await registerAndGetCookie('other@example.com');

    expect((await status(otherCookie)).body).toEqual(NOTHING_SAVED);
  });

  it('needs a login', async () => {
    expect((await status(null)).status).toBe(401);
  });
});
