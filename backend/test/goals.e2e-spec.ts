import { randomUUID } from 'node:crypto';
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
/** A goal with every answer, as POST sends it. */
const GOAL = {
  title: 'Ship my first product',
  whyItMatters: 'I want to build my own products.',
  obstacle: 'I polish instead of publishing.',
  firstOutcome: 'One demo online.',
};
const TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown;

interface GoalBody {
  id: string;
  title: string;
  whyItMatters: string;
  obstacle: string | null;
  firstOutcome: string | null;
  createdAt: string;
  archivedAt: string | null;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

describe('/api/goals', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let cookie: string;
  let userId: string;

  async function register(
    email: string,
  ): Promise<{ cookie: string; userId: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...USER, email });
    return {
      cookie: cookieHeader(sessionToken(response)),
      userId: (response.body as { id: string }).id,
    };
  }

  /** One call to /api/goals<path>. `as: null` sends no cookie at all. */
  function call(
    method: Method,
    path = '',
    options: { body?: object; as?: string | null } = {},
  ): Promise<Response> {
    let req = request(app.getHttpServer())[method](`/api/goals${path}`);
    const as = options.as === undefined ? cookie : options.as;
    if (as !== null) {
      req = req.set('Cookie', as);
    }
    return options.body === undefined ? req : req.send(options.body);
  }

  /** A goal with every answer; `title` only names it apart from others. */
  async function createGoal(title = GOAL.title): Promise<GoalBody> {
    const response = await call('post', '', { body: { ...GOAL, title } });
    return response.body as GoalBody;
  }

  async function onlyGoal(): Promise<GoalBody | undefined> {
    return ((await call('get')).body as GoalBody[])[0];
  }

  async function titles(query = ''): Promise<string[]> {
    const response = await call('get', query);
    return (response.body as GoalBody[]).map((goal) => goal.title);
  }

  /** A task with one step under the goal; there is no API for these yet. */
  async function addTaskAndStep(goalId: string): Promise<string> {
    const task = await pool.query<{ id: string }>(
      'INSERT INTO tasks (user_id, goal_id, title) VALUES ($1, $2, $3) RETURNING id',
      [userId, goalId, 'Task'],
    );
    const step = await pool.query<{ id: string }>(
      'INSERT INTO steps (user_id, task_id, title, position) VALUES ($1, $2, $3, 1) RETURNING id',
      [userId, task.rows[0]?.id, 'Step'],
    );
    return step.rows[0]?.id ?? '';
  }

  /** Work history: one focus session on the step. */
  async function addSession(stepId: string): Promise<void> {
    await pool.query(
      'INSERT INTO sessions (user_id, step_id) VALUES ($1, $2)',
      [userId, stepId],
    );
  }

  async function count(table: string): Promise<number | undefined> {
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

  // Every test starts with one logged-in user who has no goals.
  beforeEach(async () => {
    resetRateLimits(app);
    ({ cookie, userId } = await register(USER.email));
  });

  it('creates a goal with its why and lists it as active', async () => {
    const created = await call('post', '', { body: GOAL });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: UUID,
      ...GOAL,
      createdAt: TIMESTAMP,
      archivedAt: null,
    });
    const active = await call('get');
    expect(active.status).toBe(200);
    expect(active.body).toEqual([created.body]);
    expect((await call('get', '?archived=true')).body).toEqual([]);
  });

  it('returns null for the optional answers left out', async () => {
    const created = await call('post', '', {
      body: { title: GOAL.title, whyItMatters: GOAL.whyItMatters },
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ obstacle: null, firstOutcome: null });
  });

  it('lists goals in the order they were created', async () => {
    await createGoal('First');
    await createGoal('Second');
    await createGoal('Third');

    expect(await titles()).toEqual(['First', 'Second', 'Third']);
    expect(await titles('?archived=false')).toEqual([
      'First',
      'Second',
      'Third',
    ]);
  });

  describe('PATCH changes only the fields that are sent', () => {
    it('renames a goal and leaves every other answer alone', async () => {
      const goal = await createGoal('Old title');

      const renamed = await call('patch', `/${goal.id}`, {
        body: { title: 'New title' },
      });

      expect(renamed.status).toBe(200);
      expect(renamed.body).toEqual({ ...goal, title: 'New title' });
      expect(await onlyGoal()).toEqual(renamed.body);
    });

    it('rewrites the why alone', async () => {
      const goal = await createGoal();

      const changed = await call('patch', `/${goal.id}`, {
        body: { whyItMatters: 'I want to stop waiting for permission.' },
      });

      expect(changed.status).toBe(200);
      expect(changed.body).toEqual({
        ...goal,
        whyItMatters: 'I want to stop waiting for permission.',
      });
    });

    it('clears an optional answer with null and keeps the one left out', async () => {
      const goal = await createGoal();

      const cleared = await call('patch', `/${goal.id}`, {
        body: { obstacle: null },
      });

      expect(cleared.status).toBe(200);
      expect(cleared.body).toEqual({ ...goal, obstacle: null });

      const set = await call('patch', `/${goal.id}`, {
        body: { obstacle: 'Back again.', firstOutcome: null },
      });
      expect(set.body).toEqual({
        ...goal,
        obstacle: 'Back again.',
        firstOutcome: null,
      });
    });

    it('changes nothing when nothing is sent', async () => {
      const goal = await createGoal();

      const response = await call('patch', `/${goal.id}`, { body: {} });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(goal);
    });

    it.each([
      ['null for the title', { title: null }],
      ['null for the why', { whyItMatters: null }],
      ['an empty title', { title: '' }],
      ['a title that is not text', { title: 42 }],
      ['a title longer than 200 characters', { title: 'a'.repeat(201) }],
      ['an empty why', { whyItMatters: '' }],
      ['a why longer than 1000 characters', { whyItMatters: 'a'.repeat(1001) }],
      ['an empty obstacle (null is how to clear it)', { obstacle: '' }],
      ['an unknown field', { title: 'Fine', userId: 'someone-else' }],
    ])('refuses %s with 400 and changes nothing', async (_name, body) => {
      const goal = await createGoal();

      const response = await call('patch', `/${goal.id}`, { body });

      expect(response.status).toBe(400);
      expect(await onlyGoal()).toEqual(goal);
    });
  });

  it('archive hides the goal from the active list; unarchive restores it', async () => {
    const goal = await createGoal();
    await createGoal('Stays active');

    const archived = await call('post', `/${goal.id}/archive`);

    expect(archived.status).toBe(200);
    expect(archived.body).toEqual({ ...goal, archivedAt: TIMESTAMP });
    expect(await titles()).toEqual(['Stays active']);
    expect(await titles('?archived=true')).toEqual([goal.title]);

    const restored = await call('post', `/${goal.id}/unarchive`);

    expect(restored.status).toBe(200);
    expect(restored.body).toEqual(goal);
    expect(await titles()).toEqual([goal.title, 'Stays active']);
    expect(await titles('?archived=true')).toEqual([]);
  });

  it('keeps the first archivedAt when a goal is archived twice', async () => {
    const goal = await createGoal();
    const first = await call('post', `/${goal.id}/archive`);

    const second = await call('post', `/${goal.id}/archive`);

    expect(second.status).toBe(200);
    expect((second.body as GoalBody).archivedAt).toBe(
      (first.body as GoalBody).archivedAt,
    );
  });

  it('deletes a goal without sessions, with its tasks and steps', async () => {
    const goal = await createGoal();
    await addTaskAndStep(goal.id);

    const response = await call('delete', `/${goal.id}`);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(await count('goals')).toBe(0);
    expect(await count('tasks')).toBe(0);
    expect(await count('steps')).toBe(0);
  });

  it('refuses to delete a goal with a session: 409, nothing deleted', async () => {
    const goal = await createGoal();
    await addSession(await addTaskAndStep(goal.id));

    const response = await call('delete', `/${goal.id}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      message: 'This has work history. Archive the goal instead.',
    });
    expect(await count('goals')).toBe(1);
    expect(await count('tasks')).toBe(1);
    expect(await count('steps')).toBe(1);
    expect(await count('sessions')).toBe(1);
    // The way out the message names does work.
    expect((await call('post', `/${goal.id}/archive`)).status).toBe(200);
  });

  it("answers 404 on every endpoint for another user's goal", async () => {
    const goal = await createGoal('Mine');
    await addSession(await addTaskAndStep(goal.id));
    const other = await register('other@example.com');
    const as = other.cookie;

    expect((await call('get', '', { as })).body).toEqual([]);
    expect((await call('get', '?archived=true', { as })).body).toEqual([]);
    expect(
      (await call('patch', `/${goal.id}`, { as, body: { title: 'Theirs' } }))
        .status,
    ).toBe(404);
    expect((await call('post', `/${goal.id}/archive`, { as })).status).toBe(
      404,
    );
    expect((await call('post', `/${goal.id}/unarchive`, { as })).status).toBe(
      404,
    );
    // 404, not 409: the answer must not reveal that the goal exists.
    expect((await call('delete', `/${goal.id}`, { as })).status).toBe(404);

    // Nothing the other user tried changed the goal.
    expect((await call('get')).body).toEqual([goal]);
  });

  it('answers 404 for a goal that does not exist', async () => {
    const missing = `/${randomUUID()}`;

    const renamed = await call('patch', missing, { body: { title: 'x' } });

    expect(renamed.status).toBe(404);
    expect(renamed.body).toMatchObject({ message: 'Goal not found.' });
    expect((await call('post', `${missing}/archive`)).status).toBe(404);
    expect((await call('post', `${missing}/unarchive`)).status).toBe(404);
    expect((await call('delete', missing)).status).toBe(404);
  });

  it('answers 400 for an id that is not a UUID', async () => {
    expect(
      (await call('patch', '/not-a-uuid', { body: { title: 'x' } })).status,
    ).toBe(400);
    expect((await call('post', '/not-a-uuid/archive')).status).toBe(400);
    expect((await call('post', '/not-a-uuid/unarchive')).status).toBe(400);
    expect((await call('delete', '/not-a-uuid')).status).toBe(400);
  });

  it('rejects an archived filter that is not true or false', async () => {
    expect((await call('get', '?archived=maybe')).status).toBe(400);
    expect((await call('get', '?other=1')).status).toBe(400);
  });

  it('needs a login on every endpoint', async () => {
    const goal = await createGoal();
    const as = null;

    expect((await call('get', '', { as })).status).toBe(401);
    expect((await call('post', '', { as, body: GOAL })).status).toBe(401);
    expect(
      (await call('patch', `/${goal.id}`, { as, body: { title: 'x' } })).status,
    ).toBe(401);
    expect((await call('post', `/${goal.id}/archive`, { as })).status).toBe(
      401,
    );
    expect((await call('post', `/${goal.id}/unarchive`, { as })).status).toBe(
      401,
    );
    expect((await call('delete', `/${goal.id}`, { as })).status).toBe(401);
    expect(await count('goals')).toBe(1);
  });

  it.each([
    ['a missing title', { whyItMatters: GOAL.whyItMatters }],
    ['a missing why', { title: GOAL.title }],
    ['an empty title', { ...GOAL, title: '' }],
    ['an empty why', { ...GOAL, whyItMatters: '' }],
    ['a title that is not text', { ...GOAL, title: 42 }],
    ['a title longer than 200 characters', { ...GOAL, title: 'a'.repeat(201) }],
    [
      'a why longer than 1000 characters',
      { ...GOAL, whyItMatters: 'a'.repeat(1001) },
    ],
    [
      'an obstacle longer than 1000 characters',
      { ...GOAL, obstacle: 'a'.repeat(1001) },
    ],
    ['an unknown field', { ...GOAL, userId: 'someone-else' }],
  ])('refuses to create with %s: 400, nothing saved', async (_name, body) => {
    const response = await call('post', '', { body });

    expect(response.status).toBe(400);
    expect(await count('goals')).toBe(0);
  });
});
