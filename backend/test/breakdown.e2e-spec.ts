import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { FakeAi } from './helpers/fake-ai.js';
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
const STEP = { title: 'Install PostgreSQL' };
const SUGGESTED = [
  'Read the SELECT chapter of the tutorial',
  'Write five SELECT queries on the orders table',
  'Add a WHERE and an ORDER BY to each of them',
];
const DAILY_LIMIT = 10;

type Method = 'get' | 'post' | 'patch' | 'delete';

describe('task breakdown', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  const fake = new FakeAi();
  let cookie: string;
  let userId: string;
  let goalId: string;
  let taskId: string;

  async function register(
    email: string,
    locale = USER.locale,
  ): Promise<{ cookie: string; userId: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...USER, email, locale });
    const registered = {
      cookie: cookieHeader(sessionToken(response)),
      userId: (response.body as { id: string }).id,
    };
    await saveRequiredScreens(app, registered.cookie);
    return registered;
  }

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
    as = cookie,
  ): Promise<string> {
    const response = await call('post', path, { body, as });
    expect(response.status).toBe(201);
    return (response.body as { id: string }).id;
  }

  /** A goal with one task that has one step; the ids. */
  async function plan(
    as = cookie,
    task = TASK.title,
  ): Promise<{ goalId: string; taskId: string }> {
    const goal = await created('/goals', GOAL, as);
    const taskIdOf = await created(`/goals/${goal}/tasks`, { title: task }, as);
    await created(`/tasks/${taskIdOf}/steps`, STEP, as);
    return { goalId: goal, taskId: taskIdOf };
  }

  function breakdown(
    task = taskId,
    as: string | null = cookie,
  ): Promise<Response> {
    return call('post', `/tasks/${task}/breakdown`, { as });
  }

  async function count(table: string): Promise<number | undefined> {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table}`,
    );
    return rows[0]?.count;
  }

  async function insertCalls(howMany: number): Promise<void> {
    for (let i = 0; i < howMany; i++) {
      await pool.query(
        "INSERT INTO ai_calls (user_id, kind) VALUES ($1, 'struggle')",
        [userId],
      );
    }
  }

  beforeAll(async () => {
    app = await createTestApp({ ai: fake });
    pool = app.get(DatabaseService).pool;
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts with one logged-in user who has finished onboarding
  // and has one active goal, with one task, with one step. The fake model
  // answers three suggested steps.
  beforeEach(async () => {
    resetRateLimits(app);
    fake.reset();
    fake.answersJson({ steps: SUGGESTED });
    ({ cookie, userId } = await register(USER.email));
    ({ goalId, taskId } = await plan());
  });

  it('answers the suggested steps, in order, and creates none of them', async () => {
    const response = await breakdown();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ steps: SUGGESTED });
    expect(await count('steps')).toBe(1);
    expect(await count('ai_calls')).toBe(1);
  });

  it('tells the model the goal and its why, the task, and the steps it already has', async () => {
    await breakdown();

    const { system, user } = fake.lastPrompt;
    expect(system).toContain('between 3 and 7 steps');
    expect(system).toContain('Write the steps in English');
    expect(user).toContain(`Title: ${GOAL.title}`);
    expect(user).toContain(`Why it matters: ${GOAL.whyItMatters}`);
    expect(user).toContain(`## Task\n${TASK.title}`);
    expect(user).toContain(`- ${STEP.title}`);
    expect(user.trimEnd()).toMatch(
      /in English, whatever language the text above is in\.$/,
    );
  });

  it('follows the language of the task title, not of the account', async () => {
    const { taskId: arabicTask } = await plan(cookie, 'تعلم PostgreSQL');
    fake.answersJson({
      steps: [
        'اقرأ فصل SELECT',
        'اكتب خمسة استعلامات',
        'أضف WHERE لكل استعلام',
      ],
    });

    const response = await breakdown(arabicTask);

    expect(response.status).toBe(200);
    expect(fake.lastPrompt.system).toContain('Write the steps in Arabic');
    expect(fake.lastPrompt.user).toContain('تعلم PostgreSQL');
  });

  it("answers 404 for another user's task, exactly like no task at all", async () => {
    const other = await register('other@example.com');

    const theirs = await breakdown(taskId, other.cookie);
    const nobodys = await breakdown(randomUUID());

    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(nobodys.body);
    expect(nobodys.body).toMatchObject({ code: 'task.not_found' });
    expect(fake.calls).toEqual([]);
  });

  it('refuses a task under an archived goal, and sends nothing', async () => {
    await call('post', `/goals/${goalId}/archive`);

    const response = await breakdown();

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'goal.archived' });
    expect(fake.calls).toEqual([]);
  });

  it('refuses once today has reached the limit, counting every kind of call', async () => {
    await insertCalls(DAILY_LIMIT);

    const response = await breakdown();

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ code: 'ai.daily_limit' });
    expect(fake.calls).toEqual([]);
    expect(await count('ai_calls')).toBe(DAILY_LIMIT);
  });

  it('lets one of two requests at the limit through', async () => {
    await insertCalls(DAILY_LIMIT - 1);

    const responses = await Promise.all([breakdown(), breakdown()]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(await count('ai_calls')).toBe(DAILY_LIMIT);
  });

  it('answers 503 and counts nothing when the model is down', async () => {
    fake.fails();

    const response = await breakdown();

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'ai.unavailable' });
    expect(await count('ai_calls')).toBe(0);
  });

  it.each([
    ['not JSON', 'Read the chapter.'],
    ['two steps', JSON.stringify({ steps: ['a', 'b'] })],
    [
      'eight steps',
      JSON.stringify({ steps: ['1', '2', '3', '4', '5', '6', '7', '8'] }),
    ],
    ['a blank step', JSON.stringify({ steps: ['a', ' ', 'c'] })],
    [
      'a step over 200 characters',
      JSON.stringify({ steps: ['x'.repeat(201), 'b', 'c'] }),
    ],
  ])('answers 503 and counts nothing when the reply is %s', async (_, text) => {
    fake.answersText(text);

    const response = await breakdown();

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'ai.unavailable' });
    expect(await count('ai_calls')).toBe(0);
  });

  it('refuses an id that is not a UUID', async () => {
    const response = await breakdown('not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'bad_request' });
  });

  it('needs a login', async () => {
    expect((await breakdown(taskId, null)).status).toBe(401);
  });
});
