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
/** A review with every field, as POST /sessions/:id/end takes it. */
const REVIEW = {
  outcome: 'progress',
  rating: 4,
  note: 'Wrote three SELECT queries.',
};
const DONE = { outcome: 'done', rating: 5 };
const TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown;

interface Titled {
  id: string;
  title: string;
}

interface SessionBody {
  id: string;
  startedAt: string;
  endedAt: string | null;
  step: Titled;
  task: Titled;
  goal: Titled;
}

interface EndedBody extends SessionBody {
  endedAt: string;
  outcome: string;
  rating: number;
  note: string | null;
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

  /** Starts a session on the step and returns it. */
  async function started(step = stepId): Promise<SessionBody> {
    return (await start({ stepId: step })).body as SessionBody;
  }

  /**
   * POST /sessions/:id/end. `body` is unknown so that bad bodies can be
   * sent.
   */
  function end(
    sessionId: string,
    body: unknown = REVIEW,
    as: string | null = cookie,
  ): Promise<Response> {
    return call('post', `/sessions/${sessionId}/end`, {
      body: body as object,
      as,
    });
  }

  /** POST /sessions/:id/stop: the clock stops, the review is still owed. */
  function stop(
    sessionId: string,
    as: string | null = cookie,
  ): Promise<Response> {
    return call('post', `/sessions/${sessionId}/stop`, { as });
  }

  /** Ends the user's active session, with any review. */
  async function endSession(): Promise<void> {
    await end(((await active()).body as SessionBody).id);
  }

  /** When the step was marked done, as the API shows it. */
  async function doneAt(step = stepId): Promise<string | null | undefined> {
    const response = await call('get', `/tasks/${taskId}/steps`);
    return (response.body as { id: string; doneAt: string | null }[]).find(
      (item) => item.id === step,
    )?.doneAt;
  }

  /** The status the API gives the task, read from its steps. */
  async function taskStatus(): Promise<string | undefined> {
    const response = await call('get', `/goals/${goalId}/tasks`);
    return (response.body as { id: string; status: string }[]).find(
      (item) => item.id === taskId,
    )?.status;
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
      endedAt: null,
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
      message: 'No focus session is open.',
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
        message: 'A focus session is still open. End it first.',
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
        message:
          'A focus session under this goal is not finished. End it first.',
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

  describe('ending a session', () => {
    it('ends it with its review and answers with it', async () => {
      const session = await started();

      const ended = await end(session.id);

      expect(ended.status).toBe(200);
      // The running session's fields, and the end with its review.
      expect(ended.body).toEqual({
        ...session,
        endedAt: TIMESTAMP,
        ...REVIEW,
      });
      const body = ended.body as EndedBody;
      expect(Date.parse(body.endedAt)).toBeGreaterThan(
        Date.parse(body.startedAt),
      );
      const { rows } = await pool.query(
        'SELECT ended_at, outcome, rating, note FROM sessions',
      );
      expect(rows).toEqual([{ ended_at: new Date(body.endedAt), ...REVIEW }]);
    });

    it('is no longer the running session, and the next one can start', async () => {
      const session = await started();

      await end(session.id);

      expect((await active()).status).toBe(404);
      expect((await start()).status).toBe(201);
      expect(await count('sessions')).toBe(2);
    });

    describe('with outcome done', () => {
      it('marks the step done, at the moment the session ended', async () => {
        const session = await started();

        const ended = await end(session.id, DONE);

        expect(ended.status).toBe(200);
        expect(await doneAt()).toBe((ended.body as EndedBody).endedAt);
      });

      it('moves the task to in_progress, and to done with its last step', async () => {
        const second = await created(
          `/tasks/${taskId}/steps`,
          { title: 'Practice WHERE' },
          cookie,
        );
        expect(await taskStatus()).toBe('todo');

        await end((await started()).id, DONE);
        expect(await taskStatus()).toBe('in_progress');

        await end((await started(second)).id, DONE);
        expect(await taskStatus()).toBe('done');
      });

      it('keeps the time of a step ticked while the session ran', async () => {
        const session = await started();
        const ticked = await call('patch', `/steps/${stepId}`, {
          body: { done: true },
        });
        const tickedAt = (ticked.body as { doneAt: string }).doneAt;

        const ended = await end(session.id, DONE);

        expect(ended.status).toBe(200);
        expect(await doneAt()).toBe(tickedAt);
      });
    });

    it.each(['progress', 'stuck', 'distracted', 'tired'])(
      'leaves the step not done with outcome %s',
      async (outcome) => {
        const session = await started();

        const ended = await end(session.id, { outcome, rating: 2 });

        expect(ended.status).toBe(200);
        expect((ended.body as EndedBody).outcome).toBe(outcome);
        expect(await doneAt()).toBeNull();
        expect(await taskStatus()).toBe('todo');
      },
    );

    it('saves no note as null, left out or sent as null', async () => {
      const leftOut = await end((await started()).id, {
        outcome: 'tired',
        rating: 3,
      });
      const sentNull = await end((await started()).id, {
        outcome: 'tired',
        rating: 3,
        note: null,
      });

      expect(leftOut.status).toBe(200);
      expect((leftOut.body as EndedBody).note).toBeNull();
      expect(sentNull.status).toBe(200);
      expect((sentNull.body as EndedBody).note).toBeNull();
    });

    it('answers 404 for a session that has already ended, and keeps its review', async () => {
      const session = await started();
      const first = await end(session.id, {
        outcome: 'stuck',
        rating: 2,
        note: 'First',
      });

      const again = await end(session.id, { ...DONE, note: 'Second' });

      expect(again.status).toBe(404);
      expect(again.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        code: 'session.not_found',
        message: 'Session not found, or it has already been reviewed.',
      });
      // The first review stands, and the refused `done` marked nothing.
      const { rows } = await pool.query(
        'SELECT ended_at, outcome, rating, note FROM sessions',
      );
      expect(rows).toEqual([
        {
          ended_at: new Date((first.body as EndedBody).endedAt),
          outcome: 'stuck',
          rating: 2,
          note: 'First',
        },
      ]);
      expect(await doneAt()).toBeNull();
    });

    // A double click on "End". "Is it still running?" is part of the
    // UPDATE, so the second one finds nothing left to end.
    it('lets one of two ends at the same moment through', async () => {
      const session = await started();

      const responses = await Promise.all([end(session.id), end(session.id)]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 404,
      ]);
    });

    it("answers 404 for another user's session, exactly like no session at all", async () => {
      const session = await started();
      const other = await register('other@example.com');

      const theirs = await end(session.id, DONE, other.cookie);
      const missing = await end(randomUUID(), DONE, other.cookie);

      expect(theirs.status).toBe(404);
      expect(theirs.body).toMatchObject({ code: 'session.not_found' });
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual(theirs.body);
      // Nothing the other user tried changed anything.
      expect((await active()).body).toEqual(session);
      expect(await doneAt()).toBeNull();
    });

    it('answers 400 for an id that is not a UUID', async () => {
      const response = await end('not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'bad_request' });
    });

    // An ended session is work history as much as a running one.
    it('leaves the step impossible to delete', async () => {
      await end((await started()).id);

      const refused = await call('delete', `/steps/${stepId}`);

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'step.has_work_history' });
    });

    it.each<[string, object, string]>([
      ['a missing outcome', { rating: 4 }, 'outcome'],
      ['a missing rating', { outcome: 'done' }, 'rating'],
      ['an unknown outcome', { ...REVIEW, outcome: 'bored' }, 'outcome'],
      ['null for the outcome', { ...REVIEW, outcome: null }, 'outcome'],
      ['a rating of 0', { ...REVIEW, rating: 0 }, 'rating'],
      ['a rating of 6', { ...REVIEW, rating: 6 }, 'rating'],
      [
        'a rating that is not a whole number',
        { ...REVIEW, rating: 2.5 },
        'rating',
      ],
      ['a rating sent as text', { ...REVIEW, rating: '4' }, 'rating'],
      ['an empty note', { ...REVIEW, note: '' }, 'note'],
      [
        'a note longer than 1000 characters',
        { ...REVIEW, note: 'a'.repeat(1001) },
        'note',
      ],
      ['a note that is not text', { ...REVIEW, note: 42 }, 'note'],
      // The time is the server's. It cannot be sent.
      [
        'an endedAt',
        { ...REVIEW, endedAt: '2020-01-01T00:00:00.000Z' },
        'endedAt',
      ],
    ])(
      'refuses to end with %s: 400, still running',
      async (_name, body, field) => {
        const session = await started();

        const response = await end(session.id, body);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ code: 'validation.failed' });
        const { errors } = response.body as { errors: { field: string }[] };
        expect([...new Set(errors.map((error) => error.field))]).toEqual([
          field,
        ]);
        expect((await active()).body).toEqual(session);
        expect(await doneAt()).toBeNull();
      },
    );
  });

  describe('stopping the clock, review later', () => {
    it('stops the clock and keeps the session open, awaiting its review', async () => {
      const session = await started();

      const stopped = await stop(session.id);

      expect(stopped.status).toBe(200);
      expect(stopped.body).toEqual({ ...session, endedAt: TIMESTAMP });
      // Still the active session, now with its end and no review.
      expect((await active()).body).toEqual(stopped.body);
      const { rows } = await pool.query(
        'SELECT ended_at, outcome, rating, note FROM sessions',
      );
      expect(rows).toEqual([
        {
          ended_at: new Date((stopped.body as SessionBody).endedAt ?? ''),
          outcome: null,
          rating: null,
          note: null,
        },
      ]);
    });

    it('still blocks a new start and the archive of its goal', async () => {
      const session = await started();
      await stop(session.id);
      const another = await created(
        `/tasks/${taskId}/steps`,
        { title: 'Practice WHERE' },
        cookie,
      );

      const refusedStart = await start({ stepId: another });
      const refusedArchive = await call('post', `/goals/${goalId}/archive`);

      expect(refusedStart.status).toBe(409);
      expect(refusedStart.body).toMatchObject({
        code: 'session.already_active',
      });
      expect(refusedArchive.status).toBe(409);
      expect(refusedArchive.body).toMatchObject({
        code: 'goal.session_running',
      });
      expect(await archivedAt()).toBeNull();
      expect(await count('sessions')).toBe(1);
    });

    it('is completed by the review, keeping the time the clock stopped', async () => {
      const session = await started();
      const stopped = (await stop(session.id)).body as SessionBody;
      await new Promise((resolve) => setTimeout(resolve, 20));

      const ended = await end(session.id);

      expect(ended.status).toBe(200);
      // The same endedAt as the stop: the review did not move it.
      expect(ended.body).toEqual({ ...stopped, ...REVIEW });
      expect((await active()).status).toBe(404);
      expect((await start()).status).toBe(201);
      expect((await call('post', `/goals/${goalId}/archive`)).status).toBe(409);
    });

    it('marks the step done at the time the clock stopped, not at the review', async () => {
      const session = await started();
      const stopped = (await stop(session.id)).body as SessionBody;
      await new Promise((resolve) => setTimeout(resolve, 20));

      const ended = await end(session.id, DONE);

      expect(ended.status).toBe(200);
      expect(await doneAt()).toBe(stopped.endedAt);
      expect(await taskStatus()).toBe('done');
    });

    it('answers 404 once the clock has stopped, and after the review', async () => {
      const session = await started();
      await stop(session.id);

      const again = await stop(session.id);

      expect(again.status).toBe(404);
      expect(again.body).toEqual({
        statusCode: 404,
        error: 'Not Found',
        code: 'session.not_running',
        message: 'Session not found, or it is not running.',
      });
      await end(session.id);
      expect((await stop(session.id)).status).toBe(404);
    });

    // A double click on "Later".
    it('lets one of two stops at the same moment through', async () => {
      const session = await started();

      const responses = await Promise.all([stop(session.id), stop(session.id)]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 404,
      ]);
    });

    it("answers 404 for another user's session, exactly like no session at all", async () => {
      const session = await started();
      const other = await register('other@example.com');

      const theirs = await stop(session.id, other.cookie);
      const missing = await stop(randomUUID(), other.cookie);

      expect(theirs.status).toBe(404);
      expect(theirs.body).toMatchObject({ code: 'session.not_running' });
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual(theirs.body);
      // Still running for its owner.
      expect((await active()).body).toEqual(session);
    });

    it('answers 400 for an id that is not a UUID', async () => {
      const response = await stop('not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'bad_request' });
    });
  });

  describe('the history', () => {
    function history(
      query = '',
      as: string | null = cookie,
    ): Promise<Response> {
      return call('get', `/sessions${query}`, { as });
    }

    /** A completed session written by hand, started some time ago. */
    async function completedAgo(interval: string): Promise<void> {
      await pool.query(
        `INSERT INTO sessions
           (user_id, step_id, started_at, ended_at, outcome, rating)
         VALUES ($1, $2, now() - $3::interval,
                 now() - $3::interval + interval '25 minutes', 'progress', 3)`,
        [userId, stepId, interval],
      );
    }

    it('lists completed sessions newest first, with their reviews', async () => {
      const first = await end((await started()).id, {
        outcome: 'stuck',
        rating: 2,
        note: 'First',
      });
      const another = await created(
        `/tasks/${taskId}/steps`,
        { title: 'Practice WHERE' },
        cookie,
      );
      const second = await end((await started(another)).id, {
        ...DONE,
        note: 'Second',
      });

      const listed = await history();

      expect(listed.status).toBe(200);
      expect(listed.body).toEqual([second.body, first.body]);
    });

    it('leaves the open session out until it is reviewed', async () => {
      const done = await end((await started()).id);
      const open = await started();
      expect((await history()).body).toEqual([done.body]);

      await stop(open.id);
      expect((await history()).body).toEqual([done.body]);

      const reviewed = await end(open.id);
      expect((await history()).body).toEqual([reviewed.body, done.body]);
    });

    it('is empty with nothing completed', async () => {
      await started();

      const listed = await history();

      expect(listed.status).toBe(200);
      expect(listed.body).toEqual([]);
    });

    it('looks back the same days as progress', async () => {
      // Six days ago is the first day of a week; seven days ago is out.
      await completedAgo('6 days');
      await completedAgo('7 days');

      const week = (await history()).body as EndedBody[];
      const eight = (await history('?days=8')).body as EndedBody[];
      const progress = (await call('get', '/progress')).body as {
        totals: { focusMinutes: number };
      };

      expect(week).toHaveLength(1);
      expect(eight).toHaveLength(2);
      expect(progress.totals.focusMinutes).toBe(25);
    });

    it("does not list another user's sessions", async () => {
      const other = await register('other@example.com');
      await saveRequiredScreens(app, other.cookie);
      const theirs = await plan(other.cookie, 'Their goal');
      const session = (await start({ stepId: theirs.stepId }, other.cookie))
        .body as SessionBody;
      await end(session.id, REVIEW, other.cookie);

      expect((await history()).body).toEqual([]);
      expect((await history('', other.cookie)).body).toHaveLength(1);
    });

    it.each(['0', '91', 'x'])('refuses days=%s: 400', async (days) => {
      const response = await history(`?days=${days}`);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'validation.failed',
        errors: [{ field: 'days', code: 'matches' }],
      });
    });

    it('refuses an unknown query field: 400', async () => {
      const response = await history('?weeks=1');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        errors: [{ field: 'weeks', code: 'whitelistValidation' }],
      });
    });
  });

  it('needs a login on every endpoint', async () => {
    const session = await started();
    const as = null;

    expect((await start({ stepId }, as)).status).toBe(401);
    expect((await active(as)).status).toBe(401);
    expect((await stop(session.id, as)).status).toBe(401);
    expect((await call('get', '/sessions', { as })).status).toBe(401);
    expect((await end(session.id, REVIEW, as)).status).toBe(401);
    expect((await active()).body).toEqual(session);
    expect(await count('sessions')).toBe(1);
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
