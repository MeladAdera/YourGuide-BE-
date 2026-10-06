import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';
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
  title: 'Become a stronger full-stack developer',
  whyItMatters: 'I want to build my own products.',
};
const TASK = { title: 'Learn PostgreSQL' };
const STEP = { title: 'Understand SELECT' };
const TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown;

interface Titled {
  id: string;
  title: string;
}

interface SessionBody {
  id: string;
  startedAt: string;
  step: Titled;
  task: Titled;
  goal: Titled;
}

/** The ids of a goal, its one task and that task's one step. */
interface Plan {
  goalId: string;
  taskId: string;
  stepId: string;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

describe('sessions', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let cookie: string;
  let userId: string;
  let goalId: string;
  let taskId: string;
  let stepId: string;

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

  /** POST /sessions. `body` is unknown so that bad bodies can be sent. */
  function start(
    body: unknown = { stepId },
    as: string | null = cookie,
  ): Promise<Response> {
    return call('post', '/sessions', { body: body as object, as });
  }

  function active(as: string | null = cookie): Promise<Response> {
    return call('get', '/sessions/active', { as });
  }

  /**
   * Ends the user's running session by hand. The API for it is the next
   * step (POST /sessions/:id/end); the rules here only need the row to be
   * ended.
   */
  async function endSession(): Promise<void> {
    await pool.query(
      `UPDATE sessions SET ended_at = started_at + interval '25 minutes'
        WHERE user_id = $1 AND ended_at IS NULL`,
      [userId],
    );
  }

  async function archivedAt(goal = goalId): Promise<Date | null | undefined> {
    const { rows } = await pool.query<{ archived_at: Date | null }>(
      'SELECT archived_at FROM goals WHERE id = $1',
      [goal],
    );
    return rows[0]?.archived_at;
  }

  async function count(table: string): Promise<number | undefined> {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table}`,
    );
    return rows[0]?.count;
  }

  /**
   * A second connection with a transaction left open, to play a request
   * that has started and not finished yet. Rolled back and given back to
   * the pool whatever happens.
   */
  async function unfinished(
    work: (other: PoolClient) => Promise<void>,
  ): Promise<void> {
    const other = await pool.connect();
    try {
      await other.query('BEGIN');
      await work(other);
    } finally {
      await other.query('ROLLBACK');
      other.release();
    }
  }

  /**
   * Resolves once a connection is waiting for a lock: the request under
   * test has reached the row the open transaction holds. Without this the
   * test could pass by being faster than the request, with no wait at all.
   */
  async function someoneWaits(): Promise<void> {
    for (let attempt = 0; attempt < 250; attempt++) {
      const { rows } = await pool.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if ((rows[0]?.waiting ?? 0) > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('No request waited for a lock');
  }

  beforeAll(async () => {
    app = await createTestApp();
    pool = app.get(DatabaseService).pool;
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test starts with one logged-in user who has finished onboarding
  // and has one active goal, with one task, with one step that is not done.
  // No session has ever been started.
  beforeEach(async () => {
    resetRateLimits(app);
    ({ cookie, userId } = await register(USER.email));
    await saveRequiredScreens(app, cookie);
    ({ goalId, taskId, stepId } = await plan());
  });

  it('starts a session on a step and answers with it, by name', async () => {
    const started = await start();

    expect(started.status).toBe(201);
    // Exactly these fields: no user id, no end, no review.
    expect(started.body).toEqual({
      id: UUID,
      startedAt: TIMESTAMP,
      step: { id: stepId, title: STEP.title },
      task: { id: taskId, title: TASK.title },
      goal: { id: goalId, title: GOAL.title },
    });
    const { rows } = await pool.query(
      'SELECT id, user_id, step_id, ended_at, outcome, note, rating FROM sessions',
    );
    expect(rows).toEqual([
      {
        id: (started.body as SessionBody).id,
        user_id: userId,
        step_id: stepId,
        ended_at: null,
        outcome: null,
        note: null,
        rating: null,
      },
    ]);
  });

  it("takes the start time from the server's clock", async () => {
    const before = Date.now();

    const started = await start();

    const startedAt = Date.parse((started.body as SessionBody).startedAt);
    expect(Math.abs(startedAt - before)).toBeLessThan(60_000);
  });

  it('returns the running session from /sessions/active', async () => {
    const started = await start();

    const running = await active();

    expect(running.status).toBe(200);
    expect(running.body).toEqual(started.body);
  });

  it('answers 404 from /sessions/active when nothing is running', async () => {
    const none = await active();

    expect(none.status).toBe(404);
    expect(none.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'session.none_active',
      message: 'No focus session is running.',
    });
  });

  it('leaves the step and the status of its task alone', async () => {
    await start();

    const steps = await call('get', `/tasks/${taskId}/steps`);
    expect(steps.body).toMatchObject([{ id: stepId, doneAt: null }]);
    const tasks = await call('get', `/goals/${goalId}/tasks`);
    expect(tasks.body).toMatchObject([{ id: taskId, status: 'todo' }]);
  });

  it('shows a rename the next time the session is read', async () => {
    const started = await start();
    await call('patch', `/steps/${stepId}`, { body: { title: 'New step' } });
    await call('patch', `/tasks/${taskId}`, { body: { title: 'New task' } });
    await call('patch', `/goals/${goalId}`, { body: { title: 'New goal' } });

    const running = await active();

    expect(running.body).toEqual({
      ...(started.body as SessionBody),
      step: { id: stepId, title: 'New step' },
      task: { id: taskId, title: 'New task' },
      goal: { id: goalId, title: 'New goal' },
    });
  });

  // A started session is work history at once, also while it still runs.
  it('makes the step, its task and its goal impossible to delete', async () => {
    await start();

    const step = await call('delete', `/steps/${stepId}`);
    const task = await call('delete', `/tasks/${taskId}`);
    const goal = await call('delete', `/goals/${goalId}`);

    expect([step.status, task.status, goal.status]).toEqual([409, 409, 409]);
    expect(step.body).toMatchObject({ code: 'step.has_work_history' });
    expect(task.body).toMatchObject({ code: 'task.has_work_history' });
    expect(goal.body).toMatchObject({ code: 'goal.has_work_history' });
    expect((await active()).status).toBe(200);
  });

  describe('one running session per user', () => {
    it('refuses a second start: 409, the first keeps running', async () => {
      const first = await start();
      const another = await created(
        `/tasks/${taskId}/steps`,
        { title: 'Practice WHERE' },
        cookie,
      );

      const sameStep = await start();
      const otherStep = await start({ stepId: another });

      expect(sameStep.status).toBe(409);
      expect(sameStep.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        code: 'session.already_active',
        message: 'A focus session is already running. End it first.',
      });
      expect(otherStep.status).toBe(409);
      expect(otherStep.body).toMatchObject({ code: 'session.already_active' });
      expect(await count('sessions')).toBe(1);
      expect((await active()).body).toEqual(first.body);
    });

    // A double click. No check in code could tell these two apart: both
    // would see "nothing is running". The unique index lets one through.
    it('lets one of two starts at the same moment through', async () => {
      const responses = await Promise.all([start(), start()]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      expect(await count('sessions')).toBe(1);
    });

    it('accepts a new start once the running session has ended', async () => {
      const first = await start();
      await endSession();
      expect((await active()).status).toBe(404);

      const second = await start();

      expect(second.status).toBe(201);
      expect((second.body as SessionBody).id).not.toBe(
        (first.body as SessionBody).id,
      );
      expect(await count('sessions')).toBe(2);
      expect((await active()).body).toEqual(second.body);
    });

    it('counts per user: two users each run their own', async () => {
      const other = await register('other@example.com');
      await saveRequiredScreens(app, other.cookie);
      const theirs = await plan(other.cookie, 'Their goal');
      const mine = await start();

      const started = await start({ stepId: theirs.stepId }, other.cookie);

      expect(started.status).toBe(201);
      expect((await active()).body).toEqual(mine.body);
      expect((await active(other.cookie)).body).toEqual(started.body);
    });
  });

  describe('a step under an archived goal', () => {
    beforeEach(async () => {
      await call('post', `/goals/${goalId}/archive`);
    });

    it('refuses a session: 409, nothing saved', async () => {
      const refused = await start();

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({
        code: 'goal.archived',
        message: 'This goal is archived. Unarchive it first.',
      });
      expect(await count('sessions')).toBe(0);
      expect((await active()).status).toBe(404);
    });

    it('takes a session again once the goal is unarchived', async () => {
      await call('post', `/goals/${goalId}/unarchive`);

      expect((await start()).status).toBe(201);
    });

    // 404, not 409: the answer must not reveal that the step exists. "Is
    // it yours?" is asked before "is it active?".
    it('answers 404 to another user', async () => {
      const other = await register('other@example.com');

      const refused = await start({ stepId }, other.cookie);

      expect(refused.status).toBe(404);
      expect(refused.body).toMatchObject({ code: 'step.not_found' });
    });
  });

  describe('a step that is done', () => {
    beforeEach(async () => {
      await call('patch', `/steps/${stepId}`, { body: { done: true } });
    });

    it('refuses a session: 409, nothing saved', async () => {
      const refused = await start();

      expect(refused.status).toBe(409);
      expect(refused.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        code: 'session.step_done',
        message: 'This step is done. Mark it not done to work on it again.',
      });
      expect(await count('sessions')).toBe(0);
    });

    it('takes a session again once it is marked not done', async () => {
      await call('patch', `/steps/${stepId}`, { body: { done: false } });

      expect((await start()).status).toBe(201);
    });

    it('answers 404 to another user', async () => {
      const other = await register('other@example.com');

      const refused = await start({ stepId }, other.cookie);

      expect(refused.status).toBe(404);
      expect(refused.body).toMatchObject({ code: 'step.not_found' });
    });
  });

  // The rule is about starting. Ticking the step while the timer runs is
  // the natural way to finish it.
  it('lets a step be marked done while its session runs', async () => {
    const started = await start();

    const ticked = await call('patch', `/steps/${stepId}`, {
      body: { done: true },
    });

    expect(ticked.status).toBe(200);
    expect((await active()).body).toEqual(started.body);
  });

  it("answers 404 for another user's step, exactly like no step at all", async () => {
    const other = await register('other@example.com');

    const theirs = await start({ stepId }, other.cookie);
    const missing = await start({ stepId: randomUUID() }, other.cookie);

    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      code: 'step.not_found',
      message: 'Step not found.',
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(theirs.body);
    expect(await count('sessions')).toBe(0);
  });

  it('does not show a running session to another user', async () => {
    await start();
    const other = await register('other@example.com');

    const theirs = await active(other.cookie);

    expect(theirs.status).toBe(404);
    expect(theirs.body).toMatchObject({ code: 'session.none_active' });
  });

  it('accepts a step id written in capitals', async () => {
    const started = await start({ stepId: stepId.toUpperCase() });

    expect(started.status).toBe(201);
    expect((started.body as SessionBody).step.id).toBe(stepId);
  });

  describe('at the same moment as another request', () => {
    // The step is being deleted and the delete has not finished. A plain
    // INSERT would wait and then crash on the foreign key: a 500. The
    // start reads the step with a lock first, waits there, and finds no
    // step.
    it('answers 404 when the step is deleted under it', async () => {
      let response: Response | undefined;
      await unfinished(async (other) => {
        await other.query('DELETE FROM steps WHERE id = $1', [stepId]);
        // supertest sends a request only when it is awaited: `.then` sends
        // this one now and lets the test go on.
        const pending = start().then((sent) => sent);
        await someoneWaits();
        await other.query('COMMIT');
        response = await pending;
      });

      expect(response?.status).toBe(404);
      expect(response?.body).toMatchObject({ code: 'step.not_found' });
      expect(await count('sessions')).toBe(0);
    });

    it('answers 409 when the goal is archived under it', async () => {
      let response: Response | undefined;
      await unfinished(async (other) => {
        await other.query(
          'UPDATE goals SET archived_at = now() WHERE id = $1',
          [goalId],
        );
        const pending = start().then((sent) => sent);
        await someoneWaits();
        await other.query('COMMIT');
        response = await pending;
      });

      expect(response?.status).toBe(409);
      expect(response?.body).toMatchObject({ code: 'goal.archived' });
      expect(await count('sessions')).toBe(0);
    });
  });

  describe('archiving a goal while a session runs under it', () => {
    it('is refused: 409, the goal stays active', async () => {
      await start();

      const refused = await call('post', `/goals/${goalId}/archive`);

      expect(refused.status).toBe(409);
      expect(refused.body).toEqual({
        statusCode: 409,
        error: 'Conflict',
        code: 'goal.session_running',
        message: 'A focus session is running under this goal. End it first.',
      });
      expect(await archivedAt()).toBeNull();
      expect((await active()).status).toBe(200);
    });

    it('is accepted once the session has ended', async () => {
      await start();
      await endSession();

      const archived = await call('post', `/goals/${goalId}/archive`);

      expect(archived.status).toBe(200);
      expect(await archivedAt()).toBeInstanceOf(Date);
    });

    it('is accepted for another goal of the same user', async () => {
      const other = await plan(cookie, 'Read more');
      await start();

      const archived = await call('post', `/goals/${other.goalId}/archive`);

      expect(archived.status).toBe(200);
      expect(await archivedAt(other.goalId)).toBeInstanceOf(Date);
      expect(await archivedAt()).toBeNull();
    });

    it("is not affected by another user's running session", async () => {
      const other = await register('other@example.com');
      await saveRequiredScreens(app, other.cookie);
      const theirs = await plan(other.cookie, 'Their goal');
      await start({ stepId: theirs.stepId }, other.cookie);

      const archived = await call('post', `/goals/${goalId}/archive`);

      expect(archived.status).toBe(200);
    });

    // A start that has not finished, played by hand: it holds the goal the
    // way the service does and has written its session. An archive that
    // only looked for a session, without taking the goal first, would see
    // none and put the goal away with a session about to appear under it.
    it('waits for a session that is being started, then refuses', async () => {
      let response: Response | undefined;
      await unfinished(async (other) => {
        await other.query('SELECT 1 FROM goals WHERE id = $1 FOR SHARE', [
          goalId,
        ]);
        await other.query(
          'INSERT INTO sessions (user_id, step_id) VALUES ($1, $2)',
          [userId, stepId],
        );
        const pending = call('post', `/goals/${goalId}/archive`).then(
          (sent) => sent,
        );
        await someoneWaits();
        await other.query('COMMIT');
        response = await pending;
      });

      expect(response?.status).toBe(409);
      expect(response?.body).toMatchObject({ code: 'goal.session_running' });
      expect(await archivedAt()).toBeNull();
      expect(await count('sessions')).toBe(1);
    });
  });

  it('needs a login on both endpoints', async () => {
    expect((await start({ stepId }, null)).status).toBe(401);
    expect((await active(null)).status).toBe(401);
    expect(await count('sessions')).toBe(0);
  });

  it.each<[string, (step: string) => unknown, object]>([
    ['a missing stepId', () => ({}), { field: 'stepId', code: 'isUuid' }],
    [
      'a stepId that is not a UUID',
      () => ({ stepId: 'not-a-uuid' }),
      { field: 'stepId', code: 'isUuid' },
    ],
    [
      'a stepId that is not text',
      () => ({ stepId: 42 }),
      { field: 'stepId', code: 'isUuid' },
    ],
    [
      'null for the stepId',
      () => ({ stepId: null }),
      { field: 'stepId', code: 'isUuid' },
    ],
    // The time is the server's. It cannot be sent.
    [
      'a startedAt',
      (step) => ({ stepId: step, startedAt: '2020-01-01T00:00:00.000Z' }),
      { field: 'startedAt', code: 'whitelistValidation' },
    ],
    // The user comes from the session cookie, never from the body.
    [
      'a userId',
      (step) => ({ stepId: step, userId: randomUUID() }),
      { field: 'userId', code: 'whitelistValidation' },
    ],
  ])(
    'refuses to start with %s: 400, nothing saved',
    async (_name, body, broken) => {
      const response = await start(body(stepId));

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'validation.failed',
        errors: [broken],
      });
      expect(await count('sessions')).toBe(0);
    },
  );
});
