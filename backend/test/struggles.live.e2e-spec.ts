import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { OpenAiCompatibleProvider } from '../src/ai/compatible.provider.js';
import { AppConfig } from '../src/config/app-config.js';
import { SITUATIONS } from '../src/struggles/situation.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { saveRequiredScreens } from './helpers/save-required-screens.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

/**
 * The one e2e file that talks to the real model. Skipped unless asked for:
 *
 *   LIVE_AI=1 pnpm test:e2e test/struggles.live.e2e-spec.ts
 *
 * It reads the provider and key from backend/.env (not .env.test), walks
 * POST /struggles for every situation in English and once in Arabic, and
 * prints each answer so it can be read by hand. This is YOU-26's "one real
 * call per situation" as a command.
 */
const LIVE = process.env.LIVE_AI !== undefined;

const DESCRIPTIONS = {
  stuck:
    'I have read about JOIN three times and still cannot write one that returns the right rows.',
  tired:
    'It is 10 pm, I worked all day, and I promised myself one hour of study. I have nothing left.',
  comparing:
    'A friend who started after me already has a product online. I am still on SELECT.',
  negative_thought:
    'Maybe I am just not made for programming. Real developers do not get stuck on basics.',
} as const;
const ARABIC =
  'قرأت عن JOIN ثلاث مرات وما زلت لا أستطيع كتابة استعلام يرجع الصفوف الصحيحة.';

describe.skipIf(!LIVE)('struggles against the real model', () => {
  let app: INestApplication<App>;

  async function register(email: string, locale: 'en' | 'ar'): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password: 'correct horse battery',
        timezone: 'Asia/Damascus',
        locale,
      });
    const cookie = cookieHeader(sessionToken(response));
    await saveRequiredScreens(app, cookie);
    const goal = await request(app.getHttpServer())
      .post('/api/goals')
      .set('Cookie', cookie)
      .send({
        title: 'Ship my first product',
        whyItMatters: 'To prove to myself I can finish something of my own.',
      });
    const task = await request(app.getHttpServer())
      .post(`/api/goals/${(goal.body as { id: string }).id}/tasks`)
      .set('Cookie', cookie)
      .send({ title: 'Learn PostgreSQL' });
    const step = await request(app.getHttpServer())
      .post(`/api/tasks/${(task.body as { id: string }).id}/steps`)
      .set('Cookie', cookie)
      .send({ title: 'Understand SELECT with JOIN' });
    await request(app.getHttpServer())
      .post('/api/sessions')
      .set('Cookie', cookie)
      .send({ stepId: (step.body as { id: string }).id });
    return cookie;
  }

  beforeAll(async () => {
    // The real provider, from the developer's own .env: the e2e config
    // loaded .env.test, whose key is a dummy, so the file is read here.
    const env = parseEnv(readFileSync('.env', 'utf8'));
    const config = new AppConfig({ ...process.env, ...env });
    if (config.aiBaseUrl === null) {
      throw new Error('This live test needs AI_PROVIDER=zai or compatible.');
    }
    app = await createTestApp({
      ai: new OpenAiCompatibleProvider({
        baseUrl: config.aiBaseUrl,
        apiKey: config.aiApiKey,
        model: config.aiModel,
        timeoutMs: config.aiTimeoutMs,
        extraBody:
          config.aiProvider === 'zai'
            ? { thinking: { type: 'disabled' } }
            : undefined,
      }),
    });
    console.log(`live: provider=${config.aiProvider} model=${config.aiModel}`);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetRateLimits(app);
  });

  it.each(SITUATIONS)(
    'answers an English user who is %s',
    async (situation) => {
      const cookie = await register(`live-${situation}@example.com`, 'en');
      const startedAt = Date.now();

      const response = await request(app.getHttpServer())
        .post('/api/struggles')
        .set('Cookie', cookie)
        .send({ situation, description: DESCRIPTIONS[situation] });

      const body = response.body as { advice: string; nextStep: string };
      console.log(
        `\n[en · ${situation}] ${String(response.status)} in ${String(Date.now() - startedAt)} ms\n  advice:   ${body.advice}\n  nextStep: ${body.nextStep}`,
      );
      expect(response.status).toBe(201);
      expect(body.advice).not.toMatch(/[؀-ۿ]/);
    },
    120_000,
  );

  it('answers an Arabic user in Arabic', async () => {
    const cookie = await register('live-ar@example.com', 'ar');
    const startedAt = Date.now();

    const response = await request(app.getHttpServer())
      .post('/api/struggles')
      .set('Cookie', cookie)
      .send({ situation: 'stuck', description: ARABIC });

    const body = response.body as { advice: string; nextStep: string };
    console.log(
      `\n[ar · stuck] ${String(response.status)} in ${String(Date.now() - startedAt)} ms\n  advice:   ${body.advice}\n  nextStep: ${body.nextStep}`,
    );
    expect(response.status).toBe(201);
    expect(body.advice).toMatch(/[؀-ۿ]/);
  }, 120_000);
});
