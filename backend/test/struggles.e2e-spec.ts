import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { FAKE_ADVICE, FakeAi } from './helpers/fake-ai.js';
import { resetRateLimits } from './helpers/reset-rate-limit.js';
import { saveRequiredScreens } from './helpers/save-required-screens.js';
import { cookieHeader, sessionToken } from './helpers/session-cookie.js';

const USER = {
  email: 'melad@example.com',
  password: 'correct horse battery',
  timezone: 'Asia/Dubai',
  locale: 'en',
};
const GOAL = {
  title: 'Ship my first product',
  whyItMatters: 'To prove to myself I can finish something of my own.',
};
const TASK = { title: 'Learn PostgreSQL' };
const STEP = { title: 'Understand SELECT' };
const STRUGGLE = {
  situation: 'stuck',
  description:
    'I have read the same JOIN explanation three times and still cannot write the query.',
};
const DAILY_LIMIT = 10;
const TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown;

interface StruggleBody {
  id: string;
  situation: string;
  description: string;
  advice: string;
  nextStep: string;
  continued: boolean | null;
  sessionId: string | null;
  createdAt: string;
}

interface Plan {
  goalId: string;
  taskId: string;
  stepId: string;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

describe('struggles', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  const fake = new FakeAi();
  let cookie: string;
  let userId: string;
  let stepId: string;

  async function register(
    email: string,
    locale = USER.locale,
  ): Promise<{ cookie: string; userId: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...USER, email, locale });
    return {
      cookie: cookieHeader(sessionToken(response)),
      userId: (response.body as { id: string }).id,
    };
  }

  /** One call to /api<path>. `as: null` sends no cookie at all. */
  function call(
    method: Method,
    path: string,
    options: { body?: object; as?: string | null } = {},
  ): Promise<Response> {
    let req = request(app.getHttpServer())[method](`/api${path}`);
    const as = options.as === undefined ? cookie : options.as;
    if (as !== null) {
      req = req.set('Cookie', as);
    }
    return options.body === undefined ? req : req.send(options.body);
  }

  async function created(
    path: string,
    body: object,
    as: string,
  ): Promise<string> {
    const response = await call('post', path, { body, as });
    return (response.body as { id: string }).id;
  }

  /** A goal with one task that has one step, made through the API. */
  async function plan(as = cookie, title = GOAL.title): Promise<Plan> {
    const goal = await created('/goals', { ...GOAL, title }, as);
    const task = await created(`/goals/${goal}/tasks`, TASK, as);
    const step = await created(`/tasks/${task}/steps`, STEP, as);
    return { goalId: goal, taskId: task, stepId: step };
  }

  /** POST /struggles. `body` is unknown so that bad bodies can be sent. */
  function struggle(
    body: unknown = STRUGGLE,
    as: string | null = cookie,
  ): Promise<Response> {
    return call('post', '/struggles', { body: body as object, as });
  }

  async function struggled(as = cookie): Promise<StruggleBody> {
    const response = await struggle(STRUGGLE, as);
    expect(response.status).toBe(201);
    return response.body as StruggleBody;
  }

  /** PATCH /struggles/:id. `body` is unknown so that bad bodies can be sent. */
  function answer(
    id: string,
    body: unknown = { continued: true },
    as: string | null = cookie,
  ): Promise<Response> {
    return call('patch', `/struggles/${id}`, { body: body as object, as });
  }

  /** Starts a session on the step; the id of the session. */
  async function startSession(step = stepId, as = cookie): Promise<string> {
    const response = await call('post', '/sessions', {
      body: { stepId: step },
      as,
    });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  async function count(table = 'struggles'): Promise<number | undefined> {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table}`,
    );
    return rows[0]?.count;
  }

  async function continuedOf(id: string): Promise<boolean | null | undefined> {
    const { rows } = await pool.query<{ continued: boolean | null }>(
      'SELECT continued FROM struggles WHERE id = $1',
      [id],
    );
    return rows[0]?.continued;
  }

  /**
   * Model calls written straight into `ai_calls`, at 00:30 of the user's
   * local day `daysAgo` days back: the earliest moment of that day, so a
   * test about "today" cannot pass by accident of the clock.
   */
  async function insertCalls(
    howMany: number,
    options: { daysAgo?: number; user?: string } = {},
  ): Promise<void> {
    for (let i = 0; i < howMany; i++) {
      await pool.query(
        `INSERT INTO ai_calls (user_id, kind, created_at)
         SELECT id, 'breakdown',
                (((now() AT TIME ZONE timezone)::date - $2::int)::timestamp
                 + interval '30 minutes') AT TIME ZONE timezone
           FROM users WHERE id = $1`,
        [options.user ?? userId, options.daysAgo ?? 0],
      );
    }
  }

  async function callsOf(kind: string): Promise<number | undefined> {
    const { rows } = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM ai_calls WHERE kind = $1',
      [kind],
    );
    return rows[0]?.count;
  }

  async function struggledAndContinuedToday(as = cookie): Promise<number> {
    const response = await call('get', '/progress?days=1', { as });
    const body = response.body as {
      days: { struggledAndContinued: number }[];
    };
    return body.days[0]?.struggledAndContinued ?? -1;
  }

  beforeAll(async () => {
    app = await createTestApp({ ai: fake });
    pool = app.get(DatabaseService).pool;
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts with one logged-in Dubai user who has finished
  // onboarding and has one active goal, with one task, with one step. No
  // session, no struggle. The fake model answers its fixed advice.
  beforeEach(async () => {
    resetRateLimits(app);
    fake.reset();
    ({ cookie, userId } = await register(USER.email));
    await saveRequiredScreens(app, cookie);
    ({ stepId } = await plan());
  });

  describe('asking for advice (POST /struggles)', () => {
    it("saves the struggle with the model's advice and answers with it", async () => {
      const response = await struggle();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: UUID,
        situation: 'stuck',
        description: STRUGGLE.description,
        advice: FAKE_ADVICE.advice,
        nextStep: FAKE_ADVICE.nextStep,
        continued: null,
        sessionId: null,
        createdAt: TIMESTAMP,
      });
      const { rows } = await pool.query<{ advice: string; next_step: string }>(
        'SELECT advice, next_step FROM struggles',
      );
      expect(rows).toEqual([
        { advice: FAKE_ADVICE.advice, next_step: FAKE_ADVICE.nextStep },
      ]);
      expect(await callsOf('struggle')).toBe(1);
    });

    it('links the struggle to the open session, running or stopped, and to none once reviewed', async () => {
      const sessionId = await startSession();
      expect((await struggled()).sessionId).toBe(sessionId);

      await call('post', `/sessions/${sessionId}/stop`);
      expect((await struggled()).sessionId).toBe(sessionId);

      await call('post', `/sessions/${sessionId}/end`, {
        body: { outcome: 'progress', rating: 3 },
      });
      expect((await struggled()).sessionId).toBeNull();
    });

    describe('what the model is told', () => {
      it('carries the goal and its why, the work in progress, the words, the past and the last days', async () => {
        await startSession();
        const first = await struggled();
        await answer(first.id, { continued: true });
        fake.reset();

        await struggle({
          situation: 'tired',
          description: 'It is 10 pm and I have nothing left.',
        });

        const { system, user } = fake.lastPrompt;
        expect(system).toContain('## This situation: Tired');
        expect(system).toContain('Write both fields in English.');
        expect(user).toContain(`Title: ${GOAL.title}`);
        expect(user).toContain(`Why it matters: ${GOAL.whyItMatters}`);
        expect(user).toContain(`"${STEP.title}"`);
        expect(user).toContain(`"${TASK.title}"`);
        expect(user).toContain('## Past struggles');
        expect(user).toContain(STRUGGLE.description);
        expect(user).toContain('Afterwards: continued.');
        expect(user).toContain('## Last 7 days');
        expect(user).toContain(
          'In their words: It is 10 pm and I have nothing left.',
        );
        expect(user.trimEnd()).toMatch(
          /in English, whatever language the text above is in\.$/,
        );
      });

      it('lists every active goal briefly when no session is open', async () => {
        await plan(cookie, 'Run 5 km');

        await struggle();

        const { user } = fake.lastPrompt;
        expect(user).toContain('## Goals');
        expect(user).toContain(`- ${GOAL.title} — why it matters:`);
        expect(user).toContain('- Run 5 km — why it matters:');
        expect(user).toContain('No focus session is open');
      });

      it('asks for Arabic, without assuming a gender, for an ar user', async () => {
        const arabic = await register('arabic@example.com', 'ar');
        await saveRequiredScreens(app, arabic.cookie);
        fake.answers({ advice: 'نصيحة قصيرة.', nextStep: 'خطوة واحدة.' });

        const response = await struggle(STRUGGLE, arabic.cookie);

        expect(response.status).toBe(201);
        const { system, user } = fake.lastPrompt;
        expect(system).toContain('Write both fields in Arabic.');
        expect(system).toContain('man or a woman');
        expect(user.trimEnd()).toMatch(
          /in Arabic, whatever language the text above is in\.$/,
        );
      });

      it('never tells the model a number from the check-in, nor the email', async () => {
        await struggle();

        const { system, user } = fake.lastPrompt;
        const says = user
          .split('\n')
          .find((line) => line.startsWith('- Says of themselves'));
        expect(says).toBeDefined();
        expect(says).not.toMatch(/\d/);
        expect(`${system}\n${user}`).not.toContain(USER.email);
      });
    });

    describe('when the model does not answer', () => {
      it('answers 503 and saves nothing when the model is down', async () => {
        fake.fails();

        const response = await struggle();

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({ code: 'ai.unavailable' });
        expect(await count()).toBe(0);
        expect(await callsOf('struggle')).toBe(0);
      });

      it.each([
        ['not JSON', 'Just do it.'],
        ['missing the next step', '{"advice":"Keep going."}'],
        ['blank advice', '{"advice":"  ","nextStep":"Open the file."}'],
      ])(
        'answers 503 and saves nothing when the reply is %s',
        async (_, text) => {
          fake.answersText(text);

          const response = await struggle();

          expect(response.status).toBe(503);
          expect(response.body).toMatchObject({ code: 'ai.unavailable' });
          expect(await count()).toBe(0);
        },
      );

      it('saves an answer in the wrong language, and logs a warning without the text', async () => {
        const warn = vi
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const arabic = await register('arabic@example.com', 'ar');
        await saveRequiredScreens(app, arabic.cookie);

        const response = await struggle(STRUGGLE, arabic.cookie);

        expect(response.status).toBe(201);
        const messages = warn.mock.calls.map((args) => String(args[0]));
        expect(messages).toContain('advice language mismatch locale=ar');
        expect(messages.join('\n')).not.toContain(FAKE_ADVICE.advice);
        warn.mockRestore();
      });
    });

    describe('the daily limit', () => {
      it('refuses once today has reached the limit, of any kind of call, and sends nothing to the model', async () => {
        await insertCalls(DAILY_LIMIT);

        const response = await struggle();

        expect(response.status).toBe(429);
        expect(response.body).toMatchObject({ code: 'ai.daily_limit' });
        expect(fake.calls).toEqual([]);
        expect(await count()).toBe(0);
      });

      it("counts the user's own day: a struggle at 00:30 yesterday does not count", async () => {
        await insertCalls(DAILY_LIMIT - 1);
        await insertCalls(1, { daysAgo: 1 });

        expect((await struggle()).status).toBe(201);
      });

      it('counts per user', async () => {
        const other = await register('other@example.com');
        await insertCalls(DAILY_LIMIT, { user: other.userId });

        expect((await struggle()).status).toBe(201);
      });

      it('lets one of two requests at the limit through', async () => {
        await insertCalls(DAILY_LIMIT - 1);

        const responses = await Promise.all([struggle(), struggle()]);

        expect(responses.map((r) => r.status).sort()).toEqual([201, 429]);
        expect(await count()).toBe(1);
        expect(await callsOf('struggle')).toBe(1);
      });
    });

    it('refuses until onboarding is complete, naming the missing screens', async () => {
      const fresh = await register('fresh@example.com');

      const response = await struggle(STRUGGLE, fresh.cookie);

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'struggle.onboarding_required',
        missing: expect.arrayContaining(['situation', 'values']) as unknown,
      });
      expect(fake.calls).toEqual([]);
    });

    it.each([
      ['no situation', { description: STRUGGLE.description }],
      ['an unknown situation', { ...STRUGGLE, situation: 'bored' }],
      ['a null situation', { ...STRUGGLE, situation: null }],
      ['no description', { situation: 'stuck' }],
      ['an empty description', { ...STRUGGLE, description: '' }],
      [
        'a description over 1000 characters',
        { ...STRUGGLE, description: 'x'.repeat(1001) },
      ],
      ['a description that is not text', { ...STRUGGLE, description: 42 }],
      ['a sessionId', { ...STRUGGLE, sessionId: randomUUID() }],
      ['an advice', { ...STRUGGLE, advice: 'Mine.' }],
      ['a userId', { ...STRUGGLE, userId: randomUUID() }],
    ])(
      'refuses a body with %s: 400, nothing sent, nothing saved',
      async (_, body) => {
        const response = await struggle(body);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ code: 'validation.failed' });
        expect(fake.calls).toEqual([]);
        expect(await count()).toBe(0);
      },
    );
  });

  describe('answering "did you continue?" (PATCH /struggles/:id)', () => {
    it('records continued, and progress counts it', async () => {
      const { id } = await struggled();

      const response = await answer(id, { continued: true });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id, continued: true });
      expect(await struggledAndContinuedToday()).toBe(1);
    });

    it('records stopped, and progress does not count it', async () => {
      const { id } = await struggled();

      const response = await answer(id, { continued: false });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id, continued: false });
      expect(await struggledAndContinuedToday()).toBe(0);
    });

    it('answers once: a second answer is 409 and the first stays', async () => {
      const { id } = await struggled();
      await answer(id, { continued: true });

      const response = await answer(id, { continued: false });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: 'struggle.already_answered',
      });
      expect(await continuedOf(id)).toBe(true);
    });

    it("answers 404 for another user's struggle, exactly like no struggle at all", async () => {
      const { id } = await struggled();
      const other = await register('other@example.com');

      const theirs = await answer(id, { continued: true }, other.cookie);
      const nobodys = await answer(randomUUID(), { continued: true });

      expect(theirs.status).toBe(404);
      expect(theirs.body).toEqual(nobodys.body);
      expect(nobodys.body).toMatchObject({ code: 'struggle.not_found' });
      expect(await continuedOf(id)).toBeNull();
    });

    it('refuses an id that is not a UUID', async () => {
      const response = await answer('not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'bad_request' });
    });

    it.each([
      ['no continued', {}],
      ['a word', { continued: 'yes' }],
      ['null', { continued: null }],
      ['a number', { continued: 1 }],
      ['an unknown field', { continued: true, note: 'x' }],
    ])('refuses a body with %s: 400 and nothing changes', async (_, body) => {
      const { id } = await struggled();

      const response = await answer(id, body);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'validation.failed' });
      expect(await continuedOf(id)).toBeNull();
    });

    it('lets one of two answers at the same moment through', async () => {
      const { id } = await struggled();

      const responses = await Promise.all([
        answer(id, { continued: true }),
        answer(id, { continued: false }),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });

  it('needs a login on every endpoint', async () => {
    const { id } = await struggled();

    expect((await struggle(STRUGGLE, null)).status).toBe(401);
    expect((await answer(id, { continued: true }, null)).status).toBe(401);
  });
});
