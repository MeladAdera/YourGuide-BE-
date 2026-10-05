import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
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
const TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown;

interface TaskBody {
  id: string;
  goalId: string;
  title: string;
  status: string;
  createdAt: string;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

describe('tasks', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let cookie: string;
  let userId: string;
  let goalId: string;

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

  async function createGoal(title = GOAL.title): Promise<string> {
    const response = await call('post', '/goals', { body: { ...GOAL, title } });
    return (response.body as { id: string }).id;
  }

  async function createTask(
    title = TASK.title,
    goal = goalId,
  ): Promise<TaskBody> {
    const response = await call('post', `/goals/${goal}/tasks`, {
      body: { title },
    });
    return response.body as TaskBody;
  }

  async function tasksOf(goal = goalId): Promise<TaskBody[]> {
    return (await call('get', `/goals/${goal}/tasks`)).body as TaskBody[];
  }

  /** A step under the task; the steps API comes in the next issue. */
  async function addStep(taskId: string, position: number): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO steps (user_id, task_id, title, position) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, taskId, `Step ${String(position)}`, position],
    );
    return rows[0]?.id ?? '';
  }

  async function setDone(stepId: string, done: boolean): Promise<void> {
    await pool.query(
      'UPDATE steps SET done_at = CASE WHEN $2::boolean THEN now() END WHERE id = $1',
      [stepId, done],
    );
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

  // Every test starts with one logged-in user who has finished onboarding
  // and has one active goal with no tasks.
  beforeEach(async () => {
    resetRateLimits(app);
    ({ cookie, userId } = await register(USER.email));
    await saveRequiredScreens(app, cookie);
    goalId = await createGoal();
  });

  it('adds a task to a goal and lists it, todo while it has no steps', async () => {
    const created = await call('post', `/goals/${goalId}/tasks`, {
      body: TASK,
    });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: UUID,
      goalId,
      title: TASK.title,
      status: 'todo',
      createdAt: TIMESTAMP,
    });
    const listed = await call('get', `/goals/${goalId}/tasks`);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([created.body]);
  });

  it('lists the tasks of one goal only, in the order they were created', async () => {
    const otherGoal = await createGoal('Another goal');
    await createTask('First');
    await createTask('Elsewhere', otherGoal);
    await createTask('Second');

    expect((await tasksOf()).map((task) => task.title)).toEqual([
      'First',
      'Second',
    ]);
    expect((await tasksOf(otherGoal)).map((task) => task.title)).toEqual([
      'Elsewhere',
    ]);
  });

  describe('the status is read from the steps', () => {
    async function statusOf(taskId: string): Promise<string | undefined> {
      return (await tasksOf()).find((task) => task.id === taskId)?.status;
    }

    it('goes todo → in_progress → done as steps are done, and back', async () => {
      const task = await createTask();
      const first = await addStep(task.id, 1);
      const second = await addStep(task.id, 2);
      // Steps that are not done yet do not start the task.
      expect(await statusOf(task.id)).toBe('todo');

      await setDone(first, true);
      expect(await statusOf(task.id)).toBe('in_progress');

      await setDone(second, true);
      expect(await statusOf(task.id)).toBe('done');

      await setDone(second, false);
      expect(await statusOf(task.id)).toBe('in_progress');

      await setDone(first, false);
      expect(await statusOf(task.id)).toBe('todo');
    });

    it('gives each task its own status', async () => {
      const done = await createTask('Done');
      const started = await createTask('Started');
      const untouched = await createTask('Untouched');
      await setDone(await addStep(done.id, 1), true);
      await setDone(await addStep(started.id, 1), true);
      await addStep(started.id, 2);

      expect(
        (await tasksOf()).map((task) => [task.title, task.status]),
      ).toEqual([
        ['Done', 'done'],
        ['Started', 'in_progress'],
        ['Untouched', 'todo'],
      ]);
      expect(untouched.status).toBe('todo');
    });

    it('is in the answer of a rename too', async () => {
      const task = await createTask();
      await setDone(await addStep(task.id, 1), true);

      const renamed = await call('patch', `/tasks/${task.id}`, {
        body: { title: 'Renamed' },
      });

      expect(renamed.body).toMatchObject({ title: 'Renamed', status: 'done' });
    });
  });

  describe('an archived goal is read-only', () => {
    let task: TaskBody;

    beforeEach(async () => {
      task = await createTask();
      await call('post', `/goals/${goalId}/archive`);
    });

    it('refuses a new task: 409, nothing saved', async () => {
      const refused = await call('post', `/goals/${goalId}/tasks`, {
        body: { title: 'Another' },
      });

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({
        code: 'goal.archived',
        message: 'This goal is archived. Unarchive it first.',
      });
      expect(await count('tasks')).toBe(1);
    });

    it('refuses to rename a task: 409, nothing changed', async () => {
      const refused = await call('patch', `/tasks/${task.id}`, {
        body: { title: 'Renamed' },
      });

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'goal.archived' });
      expect(await tasksOf()).toEqual([task]);
    });

    it('refuses to delete a task: 409, nothing deleted', async () => {
      await addStep(task.id, 1);

      const refused = await call('delete', `/tasks/${task.id}`);

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'goal.archived' });
      expect(await count('tasks')).toBe(1);
      expect(await count('steps')).toBe(1);
    });

    it('still lists its tasks', async () => {
      const listed = await call('get', `/goals/${goalId}/tasks`);

      expect(listed.status).toBe(200);
      expect(listed.body).toEqual([task]);
    });

    it('takes every change again once it is unarchived', async () => {
      await call('post', `/goals/${goalId}/unarchive`);

      expect(
        (await call('post', `/goals/${goalId}/tasks`, { body: TASK })).status,
      ).toBe(201);
      expect(
        (await call('patch', `/tasks/${task.id}`, { body: { title: 'x' } }))
          .status,
      ).toBe(200);
      expect((await call('delete', `/tasks/${task.id}`)).status).toBe(204);
    });

    // 404, not 409: the answer must not reveal that the goal or the task
    // exists. "Is it yours?" is asked before "is it active?".
    it('answers 404 to another user on every endpoint', async () => {
      const as = (await register('other@example.com')).cookie;

      expect(
        (await call('post', `/goals/${goalId}/tasks`, { as, body: TASK }))
          .status,
      ).toBe(404);
      expect(
        (await call('patch', `/tasks/${task.id}`, { as, body: { title: 'x' } }))
          .status,
      ).toBe(404);
      expect((await call('delete', `/tasks/${task.id}`, { as })).status).toBe(
        404,
      );
      expect((await call('get', `/goals/${goalId}/tasks`, { as })).status).toBe(
        404,
      );
      expect(await tasksOf()).toEqual([task]);
    });
  });

  it('renames a task and leaves the rest alone', async () => {
    const task = await createTask();

    const renamed = await call('patch', `/tasks/${task.id}`, {
      body: { title: 'Learn PostgreSQL properly' },
    });

    expect(renamed.status).toBe(200);
    expect(renamed.body).toEqual({
      ...task,
      title: 'Learn PostgreSQL properly',
    });
    expect(await tasksOf()).toEqual([renamed.body]);
  });

  it('changes nothing when nothing is sent', async () => {
    const task = await createTask();

    const response = await call('patch', `/tasks/${task.id}`, { body: {} });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(task);
  });

  it('deletes a task without sessions, with its steps', async () => {
    const task = await createTask();
    const kept = await createTask('Kept');
    await addStep(task.id, 1);

    const response = await call('delete', `/tasks/${task.id}`);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(await tasksOf()).toEqual([kept]);
    expect(await count('steps')).toBe(0);
    expect(await count('goals')).toBe(1);
  });

  it('refuses to delete a task with a session: 409, nothing deleted', async () => {
    const task = await createTask();
    await addSession(await addStep(task.id, 1));

    const response = await call('delete', `/tasks/${task.id}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'task.has_work_history',
      message: 'This task has work history. It cannot be deleted.',
    });
    expect(await count('tasks')).toBe(1);
    expect(await count('steps')).toBe(1);
    expect(await count('sessions')).toBe(1);
  });

  it("answers 404 on every endpoint for another user's goal or task", async () => {
    const task = await createTask('Mine');
    await addSession(await addStep(task.id, 1));
    const as = (await register('other@example.com')).cookie;

    const listed = await call('get', `/goals/${goalId}/tasks`, { as });
    expect(listed.status).toBe(404);
    expect(listed.body).toMatchObject({ code: 'goal.not_found' });
    const added = await call('post', `/goals/${goalId}/tasks`, {
      as,
      body: { title: 'Theirs' },
    });
    expect(added.status).toBe(404);
    expect(added.body).toMatchObject({ code: 'goal.not_found' });
    const renamed = await call('patch', `/tasks/${task.id}`, {
      as,
      body: { title: 'Theirs' },
    });
    expect(renamed.status).toBe(404);
    expect(renamed.body).toMatchObject({ code: 'task.not_found' });
    // 404, not 409: the answer must not reveal that the task exists.
    expect((await call('delete', `/tasks/${task.id}`, { as })).status).toBe(
      404,
    );

    // Nothing the other user tried changed anything.
    expect(await tasksOf()).toEqual([task]);
  });

  it('answers 404 for a goal or a task that does not exist', async () => {
    const missing = randomUUID();

    const listed = await call('get', `/goals/${missing}/tasks`);
    expect(listed.status).toBe(404);
    expect(listed.body).toMatchObject({
      code: 'goal.not_found',
      message: 'Goal not found.',
    });
    expect(
      (await call('post', `/goals/${missing}/tasks`, { body: TASK })).status,
    ).toBe(404);
    const renamed = await call('patch', `/tasks/${missing}`, {
      body: { title: 'x' },
    });
    expect(renamed.status).toBe(404);
    expect(renamed.body).toMatchObject({
      code: 'task.not_found',
      message: 'Task not found.',
    });
    expect((await call('delete', `/tasks/${missing}`)).status).toBe(404);
  });

  it('answers 400 for an id that is not a UUID', async () => {
    const listed = await call('get', '/goals/not-a-uuid/tasks');

    expect(listed.status).toBe(400);
    expect(listed.body).toMatchObject({ code: 'bad_request' });
    expect(
      (await call('post', '/goals/not-a-uuid/tasks', { body: TASK })).status,
    ).toBe(400);
    expect(
      (await call('patch', '/tasks/not-a-uuid', { body: { title: 'x' } }))
        .status,
    ).toBe(400);
    expect((await call('delete', '/tasks/not-a-uuid')).status).toBe(400);
  });

  it('needs a login on every endpoint', async () => {
    const task = await createTask();
    const as = null;

    expect((await call('get', `/goals/${goalId}/tasks`, { as })).status).toBe(
      401,
    );
    expect(
      (await call('post', `/goals/${goalId}/tasks`, { as, body: TASK })).status,
    ).toBe(401);
    expect(
      (await call('patch', `/tasks/${task.id}`, { as, body: { title: 'x' } }))
        .status,
    ).toBe(401);
    expect((await call('delete', `/tasks/${task.id}`, { as })).status).toBe(
      401,
    );
    expect(await tasksOf()).toEqual([task]);
  });

  const BAD_TITLES: [string, object][] = [
    ['an empty title', { title: '' }],
    ['a title that is not text', { title: 42 }],
    ['a title longer than 200 characters', { title: 'a'.repeat(201) }],
    // The status follows the steps. It cannot be sent.
    ['a status', { ...TASK, status: 'done' }],
    ['an unknown field', { ...TASK, goalId: randomUUID() }],
  ];

  it.each([['a missing title', {}], ...BAD_TITLES])(
    'refuses to create with %s: 400, nothing saved',
    async (_name, body) => {
      const response = await call('post', `/goals/${goalId}/tasks`, { body });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'validation.failed' });
      expect(await count('tasks')).toBe(0);
    },
  );

  it.each([['null for the title', { title: null }], ...BAD_TITLES])(
    'refuses to rename with %s: 400, nothing changed',
    async (_name, body) => {
      const task = await createTask();

      const response = await call('patch', `/tasks/${task.id}`, { body });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'validation.failed' });
      expect(await tasksOf()).toEqual([task]);
    },
  );
});
