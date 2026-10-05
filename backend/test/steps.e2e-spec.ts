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
const STEP = { title: 'Understand SELECT' };
const TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown;
const UUID = expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown;

interface StepBody {
  id: string;
  taskId: string;
  title: string;
  doneAt: string | null;
  createdAt: string;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('steps', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let cookie: string;
  let userId: string;
  let goalId: string;
  let taskId: string;

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

  async function createTask(title = 'Learn PostgreSQL'): Promise<string> {
    const response = await call('post', `/goals/${goalId}/tasks`, {
      body: { title },
    });
    return (response.body as { id: string }).id;
  }

  async function createStep(
    title = STEP.title,
    task = taskId,
  ): Promise<StepBody> {
    const response = await call('post', `/tasks/${task}/steps`, {
      body: { title },
    });
    return response.body as StepBody;
  }

  async function stepsOf(task = taskId): Promise<StepBody[]> {
    return (await call('get', `/tasks/${task}/steps`)).body as StepBody[];
  }

  async function titles(task = taskId): Promise<string[]> {
    return (await stepsOf(task)).map((step) => step.title);
  }

  async function setDone(stepId: string, done: boolean): Promise<Response> {
    return call('patch', `/steps/${stepId}`, { body: { done } });
  }

  /** PUT the order. `stepIds` is unknown so that bad lists can be sent. */
  function reorder(
    stepIds: unknown,
    task = taskId,
    as: string | null = cookie,
  ): Promise<Response> {
    return call('put', `/tasks/${task}/steps/order`, {
      body: { stepIds },
      as,
    });
  }

  /** The status the API gives the task, read from its steps. */
  async function taskStatus(task = taskId): Promise<string | undefined> {
    const response = await call('get', `/goals/${goalId}/tasks`);
    return (response.body as { id: string; status: string }[]).find(
      (item) => item.id === task,
    )?.status;
  }

  /** The numbers behind the order. The API never shows them. */
  async function positions(task = taskId): Promise<number[]> {
    const { rows } = await pool.query<{ position: number }>(
      'SELECT position FROM steps WHERE task_id = $1 ORDER BY position',
      [task],
    );
    return rows.map((row) => row.position);
  }

  /** Work history: one focus session on the step. The API comes in week 5. */
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
  // and has one active goal with one task that has no steps.
  beforeEach(async () => {
    resetRateLimits(app);
    ({ cookie, userId } = await register(USER.email));
    await saveRequiredScreens(app, cookie);
    const goal = await call('post', '/goals', { body: GOAL });
    goalId = (goal.body as { id: string }).id;
    taskId = await createTask();
  });

  it('adds a step to a task and lists it, not done', async () => {
    const created = await call('post', `/tasks/${taskId}/steps`, {
      body: STEP,
    });

    expect(created.status).toBe(201);
    // Exactly these fields: no position, no user id.
    expect(created.body).toEqual({
      id: UUID,
      taskId,
      title: STEP.title,
      doneAt: null,
      createdAt: TIMESTAMP,
    });
    const listed = await call('get', `/tasks/${taskId}/steps`);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([created.body]);
  });

  describe('the order', () => {
    it('lists the steps of one task only, in the order they were added', async () => {
      const otherTask = await createTask('Learn testing');
      await createStep('First');
      await createStep('Elsewhere', otherTask);
      await createStep('Second');
      await createStep('Third');

      expect(await titles()).toEqual(['First', 'Second', 'Third']);
      expect(await titles(otherTask)).toEqual(['Elsewhere']);
      // Each task counts its own steps from 1.
      expect(await positions()).toEqual([1, 2, 3]);
      expect(await positions(otherTask)).toEqual([1]);
    });

    it('puts a new step last, also after a delete in the middle', async () => {
      await createStep('First');
      const second = await createStep('Second');
      await createStep('Third');
      await call('delete', `/steps/${second.id}`);

      await createStep('Fourth');

      expect(await titles()).toEqual(['First', 'Third', 'Fourth']);
      // The delete left a gap. The order is still right, and the API
      // shows the order, not the numbers.
      expect(await positions()).toEqual([1, 3, 4]);
    });

    it('gives steps added at the same moment each their own place', async () => {
      const added = await Promise.all(
        ['A', 'B', 'C', 'D', 'E'].map((title) =>
          call('post', `/tasks/${taskId}/steps`, { body: { title } }),
        ),
      );

      expect(added.map((response) => response.status)).toEqual([
        201, 201, 201, 201, 201,
      ]);
      expect(await positions()).toEqual([1, 2, 3, 4, 5]);
    });

    it('keeps the place of a step that is renamed or marked done', async () => {
      const first = await createStep('First');
      await createStep('Second');

      await call('patch', `/steps/${first.id}`, {
        body: { title: 'First, renamed', done: true },
      });

      expect(await titles()).toEqual(['First, renamed', 'Second']);
    });
  });

  describe('done and not done', () => {
    it('moves the task todo → in_progress → done, and back', async () => {
      const first = await createStep('First');
      const second = await createStep('Second');
      // Steps that are not done yet do not start the task.
      expect(await taskStatus()).toBe('todo');

      await setDone(first.id, true);
      expect(await taskStatus()).toBe('in_progress');

      await setDone(second.id, true);
      expect(await taskStatus()).toBe('done');

      await setDone(second.id, false);
      expect(await taskStatus()).toBe('in_progress');

      await setDone(first.id, false);
      expect(await taskStatus()).toBe('todo');
    });

    it('makes a finished task in_progress again when a step is added', async () => {
      await setDone((await createStep('First')).id, true);
      expect(await taskStatus()).toBe('done');

      await createStep('One more');

      expect(await taskStatus()).toBe('in_progress');
    });

    it('finishes the task when its last open step is deleted', async () => {
      await setDone((await createStep('Done')).id, true);
      const open = await createStep('Open');
      expect(await taskStatus()).toBe('in_progress');

      await call('delete', `/steps/${open.id}`);

      expect(await taskStatus()).toBe('done');
    });

    it('writes the time when a step is marked done, and clears it again', async () => {
      const step = await createStep();

      const done = await setDone(step.id, true);

      expect(done.status).toBe(200);
      expect(done.body).toEqual({ ...step, doneAt: TIMESTAMP });
      expect(await stepsOf()).toEqual([done.body]);

      const undone = await setDone(step.id, false);

      expect(undone.status).toBe(200);
      expect(undone.body).toEqual(step);
    });

    it('keeps the first time when a step is marked done twice', async () => {
      const step = await createStep();
      const first = (await setDone(step.id, true)).body as StepBody;

      const second = await setDone(step.id, true);

      expect(second.status).toBe(200);
      expect((second.body as StepBody).doneAt).toBe(first.doneAt);
    });
  });

  describe('PATCH changes only what is sent', () => {
    it('renames a step and leaves done alone', async () => {
      const step = (await setDone((await createStep()).id, true))
        .body as StepBody;

      const renamed = await call('patch', `/steps/${step.id}`, {
        body: { title: 'Understand SELECT and WHERE' },
      });

      expect(renamed.status).toBe(200);
      expect(renamed.body).toEqual({
        ...step,
        title: 'Understand SELECT and WHERE',
      });
    });

    it('marks a step done and leaves the title alone', async () => {
      const step = await createStep();

      const done = await setDone(step.id, true);

      expect((done.body as StepBody).title).toBe(step.title);
    });

    it('changes nothing when nothing is sent', async () => {
      const step = await createStep();

      const response = await call('patch', `/steps/${step.id}`, { body: {} });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(step);
    });
  });

  describe('reorder', () => {
    let a: StepBody;
    let b: StepBody;
    let c: StepBody;

    beforeEach(async () => {
      a = await createStep('A');
      b = await createStep('B');
      c = await createStep('C');
    });

    it('puts three steps in a new order and answers with it', async () => {
      const response = await reorder([c.id, a.id, b.id]);

      expect(response.status).toBe(200);
      // The same three steps, untouched but for their order.
      expect(response.body).toEqual([c, a, b]);
      expect(await stepsOf()).toEqual([c, a, b]);
    });

    it('keeps what each step holds: its title and whether it is done', async () => {
      const done = (await setDone(b.id, true)).body as StepBody;

      const response = await reorder([done.id, c.id, a.id]);

      expect(response.body).toEqual([done, c, a]);
      expect(await taskStatus()).toBe('in_progress');
    });

    it('writes positions 1 to n, closing the gap a delete left', async () => {
      await call('delete', `/steps/${b.id}`);
      const d = await createStep('D');
      expect(await positions()).toEqual([1, 3, 4]);

      await reorder([d.id, a.id, c.id]);

      expect(await titles()).toEqual(['D', 'A', 'C']);
      expect(await positions()).toEqual([1, 2, 3]);
    });

    it('puts a step added afterwards last', async () => {
      await reorder([c.id, b.id, a.id]);

      await createStep('D');

      expect(await titles()).toEqual(['C', 'B', 'A', 'D']);
    });

    it('accepts the order the steps already have', async () => {
      const response = await reorder([a.id, b.id, c.id]);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([a, b, c]);
    });

    it('accepts ids written in capitals', async () => {
      const response = await reorder([c.id.toUpperCase(), a.id, b.id]);

      expect(response.status).toBe(200);
      expect(await titles()).toEqual(['C', 'A', 'B']);
    });

    it('accepts an empty list for a task with no steps', async () => {
      const emptyTask = await createTask('Nothing yet');

      const response = await reorder([], emptyTask);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('leaves the order of another task alone', async () => {
      const otherTask = await createTask('Learn testing');
      await createStep('X', otherTask);
      await createStep('Y', otherTask);

      await reorder([c.id, b.id, a.id]);

      expect(await titles(otherTask)).toEqual(['X', 'Y']);
    });

    // The list must be exactly the task's steps. Each of these is 400 with
    // the same code, and the order stays as it was.
    it.each<[string, () => string[]]>([
      ['a step missing', () => [a.id, b.id]],
      ['an id that is no step, added', () => [a.id, b.id, c.id, randomUUID()]],
      [
        'an id that is no step, in place of one',
        () => [a.id, randomUUID(), c.id],
      ],
      ['an empty list', () => []],
    ])('refuses a list with %s: 400, order unchanged', async (_name, ids) => {
      const response = await reorder(ids());

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'step.order_mismatch',
        message: 'The list must hold every step of this task, each once.',
      });
      expect(await stepsOf()).toEqual([a, b, c]);
    });

    it('refuses the same id twice: 400, order unchanged', async () => {
      const response = await reorder([a.id, a.id, b.id, c.id]);

      expect(response.status).toBe(400);
      // Caught by the DTO, before the database is asked.
      expect(response.body).toMatchObject({
        code: 'validation.failed',
        errors: [{ field: 'stepIds', code: 'arrayUnique' }],
      });
      expect(await stepsOf()).toEqual([a, b, c]);
    });

    it("refuses another task's step: 400, both orders unchanged", async () => {
      const otherTask = await createTask('Learn testing');
      const x = await createStep('X', otherTask);

      const inPlace = await reorder([a.id, b.id, x.id]);
      const added = await reorder([a.id, b.id, c.id, x.id]);

      expect(inPlace.status).toBe(400);
      expect(inPlace.body).toMatchObject({ code: 'step.order_mismatch' });
      expect(added.status).toBe(400);
      expect(await stepsOf()).toEqual([a, b, c]);
      expect(await stepsOf(otherTask)).toEqual([x]);
    });

    it("refuses another user's step exactly like an id that does not exist", async () => {
      const other = await register('other@example.com');
      const theirs = await pool.query<{ id: string }>(
        `WITH goal AS (
           INSERT INTO goals (user_id, title, why_it_matters)
           VALUES ($1, 'Theirs', 'Why') RETURNING id
         ), task AS (
           INSERT INTO tasks (user_id, goal_id, title)
           SELECT $1, id, 'Theirs' FROM goal RETURNING id
         )
         INSERT INTO steps (user_id, task_id, title, position)
         SELECT $1, id, 'Theirs', 1 FROM task RETURNING id`,
        [other.userId],
      );

      const withTheirs = await reorder([a.id, b.id, theirs.rows[0]?.id]);
      const withUnknown = await reorder([a.id, b.id, randomUUID()]);

      expect(withTheirs.status).toBe(400);
      expect(withTheirs.body).toEqual(withUnknown.body);
      expect(await stepsOf()).toEqual([a, b, c]);
    });

    it.each<[string, () => object]>([
      ['no list', () => ({})],
      ['a list that is not a list', () => ({ stepIds: a.id })],
      ['an id that is not a UUID', () => ({ stepIds: [a.id, 'nope', c.id] })],
      ['null for the list', () => ({ stepIds: null })],
      [
        'an unknown field',
        () => ({ stepIds: [c.id, b.id, a.id], position: 1 }),
      ],
    ])('refuses a body with %s: 400, order unchanged', async (_name, body) => {
      const response = await call('put', `/tasks/${taskId}/steps/order`, {
        body: body(),
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'validation.failed' });
      expect(await stepsOf()).toEqual([a, b, c]);
    });
  });

  describe('an archived goal is read-only', () => {
    let step: StepBody;

    beforeEach(async () => {
      step = await createStep();
      await call('post', `/goals/${goalId}/archive`);
    });

    it('refuses a new step: 409, nothing saved', async () => {
      const refused = await call('post', `/tasks/${taskId}/steps`, {
        body: { title: 'Another' },
      });

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({
        code: 'goal.archived',
        message: 'This goal is archived. Unarchive it first.',
      });
      expect(await count('steps')).toBe(1);
    });

    it.each([
      ['rename a step', { title: 'Renamed' }],
      ['mark a step done', { done: true }],
    ])('refuses to %s: 409, nothing changed', async (_name, body) => {
      const refused = await call('patch', `/steps/${step.id}`, { body });

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'goal.archived' });
      expect(await stepsOf()).toEqual([step]);
    });

    it('refuses to delete a step: 409, nothing deleted', async () => {
      const refused = await call('delete', `/steps/${step.id}`);

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'goal.archived' });
      expect(await count('steps')).toBe(1);
    });

    it('refuses to reorder: 409', async () => {
      const refused = await reorder([step.id]);

      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'goal.archived' });
    });

    it('still lists its steps', async () => {
      const listed = await call('get', `/tasks/${taskId}/steps`);

      expect(listed.status).toBe(200);
      expect(listed.body).toEqual([step]);
    });

    it('takes every change again once it is unarchived', async () => {
      await call('post', `/goals/${goalId}/unarchive`);

      expect(
        (await call('post', `/tasks/${taskId}/steps`, { body: STEP })).status,
      ).toBe(201);
      expect((await setDone(step.id, true)).status).toBe(200);
      expect((await reorder([step.id])).status).toBe(400);
      expect((await call('delete', `/steps/${step.id}`)).status).toBe(204);
    });

    // 404, not 409: the answer must not reveal that the task or the step
    // exists. "Is it yours?" is asked before "is it active?".
    it('answers 404 to another user on every endpoint', async () => {
      const as = (await register('other@example.com')).cookie;

      expect(
        (await call('post', `/tasks/${taskId}/steps`, { as, body: STEP }))
          .status,
      ).toBe(404);
      expect(
        (await call('patch', `/steps/${step.id}`, { as, body: { done: true } }))
          .status,
      ).toBe(404);
      expect((await call('delete', `/steps/${step.id}`, { as })).status).toBe(
        404,
      );
      expect((await call('get', `/tasks/${taskId}/steps`, { as })).status).toBe(
        404,
      );
      expect((await reorder([step.id], taskId, as)).status).toBe(404);
      expect(await stepsOf()).toEqual([step]);
    });
  });

  it('deletes a step without sessions and keeps the others', async () => {
    const step = await createStep('Gone');
    const kept = await createStep('Kept');

    const response = await call('delete', `/steps/${step.id}`);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(await stepsOf()).toEqual([kept]);
    expect(await count('tasks')).toBe(1);
  });

  it('refuses to delete a step with a session: 409, nothing deleted', async () => {
    const step = await createStep();
    await addSession(step.id);

    const response = await call('delete', `/steps/${step.id}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'step.has_work_history',
      message: 'This step has work history. It cannot be deleted.',
    });
    expect(await count('steps')).toBe(1);
    expect(await count('sessions')).toBe(1);
    // It can still be worked on: marking it done is not deleting it.
    expect((await setDone(step.id, true)).status).toBe(200);
  });

  it("answers 404 on every endpoint for another user's task or step", async () => {
    const step = await createStep('Mine');
    await addSession(step.id);
    const as = (await register('other@example.com')).cookie;

    const listed = await call('get', `/tasks/${taskId}/steps`, { as });
    expect(listed.status).toBe(404);
    expect(listed.body).toMatchObject({ code: 'task.not_found' });
    const added = await call('post', `/tasks/${taskId}/steps`, {
      as,
      body: { title: 'Theirs' },
    });
    expect(added.status).toBe(404);
    expect(added.body).toMatchObject({ code: 'task.not_found' });
    const changed = await call('patch', `/steps/${step.id}`, {
      as,
      body: { title: 'Theirs', done: true },
    });
    expect(changed.status).toBe(404);
    expect(changed.body).toMatchObject({ code: 'step.not_found' });
    // 404, not 409: the answer must not reveal that the step exists.
    expect((await call('delete', `/steps/${step.id}`, { as })).status).toBe(
      404,
    );
    const reordered = await reorder([step.id], taskId, as);
    expect(reordered.status).toBe(404);
    expect(reordered.body).toMatchObject({ code: 'task.not_found' });

    // Nothing the other user tried changed anything.
    expect(await stepsOf()).toEqual([step]);
    expect(await taskStatus()).toBe('todo');
  });

  it('answers 404 for a task or a step that does not exist', async () => {
    const missing = randomUUID();

    const listed = await call('get', `/tasks/${missing}/steps`);
    expect(listed.status).toBe(404);
    expect(listed.body).toMatchObject({
      code: 'task.not_found',
      message: 'Task not found.',
    });
    expect(
      (await call('post', `/tasks/${missing}/steps`, { body: STEP })).status,
    ).toBe(404);
    const changed = await call('patch', `/steps/${missing}`, {
      body: { done: true },
    });
    expect(changed.status).toBe(404);
    expect(changed.body).toMatchObject({
      code: 'step.not_found',
      message: 'Step not found.',
    });
    expect((await call('delete', `/steps/${missing}`)).status).toBe(404);
    expect((await reorder([], missing)).status).toBe(404);
  });

  it('answers 400 for an id that is not a UUID', async () => {
    const listed = await call('get', '/tasks/not-a-uuid/steps');

    expect(listed.status).toBe(400);
    expect(listed.body).toMatchObject({ code: 'bad_request' });
    expect(
      (await call('post', '/tasks/not-a-uuid/steps', { body: STEP })).status,
    ).toBe(400);
    expect(
      (await call('patch', '/steps/not-a-uuid', { body: { done: true } }))
        .status,
    ).toBe(400);
    expect((await call('delete', '/steps/not-a-uuid')).status).toBe(400);
    expect((await reorder([], 'not-a-uuid')).status).toBe(400);
  });

  it('needs a login on every endpoint', async () => {
    const step = await createStep();
    const as = null;

    expect((await call('get', `/tasks/${taskId}/steps`, { as })).status).toBe(
      401,
    );
    expect(
      (await call('post', `/tasks/${taskId}/steps`, { as, body: STEP })).status,
    ).toBe(401);
    expect(
      (await call('patch', `/steps/${step.id}`, { as, body: { done: true } }))
        .status,
    ).toBe(401);
    expect((await call('delete', `/steps/${step.id}`, { as })).status).toBe(
      401,
    );
    expect((await reorder([step.id], taskId, as)).status).toBe(401);
    expect(await stepsOf()).toEqual([step]);
  });

  const BAD_TITLES: [string, object][] = [
    ['an empty title', { title: '' }],
    ['a title that is not text', { title: 42 }],
    ['a title longer than 200 characters', { title: 'a'.repeat(201) }],
    // The place and the time are the server's. Neither can be sent.
    ['a position', { ...STEP, position: 1 }],
    ['a doneAt', { ...STEP, doneAt: '2020-01-01T00:00:00.000Z' }],
  ];

  it.each([
    ['a missing title', {}],
    // A new step is not done. `done` belongs to PATCH.
    ['a done flag', { ...STEP, done: true }],
    ...BAD_TITLES,
  ])('refuses to create with %s: 400, nothing saved', async (_name, body) => {
    const response = await call('post', `/tasks/${taskId}/steps`, { body });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'validation.failed' });
    expect(await count('steps')).toBe(0);
  });

  it.each([
    ['null for the title', { title: null }],
    ['null for done', { done: null }],
    ['a done that is not true or false', { done: 'yes' }],
    ...BAD_TITLES,
  ])('refuses to change with %s: 400, nothing changed', async (_name, body) => {
    const step = await createStep();

    const response = await call('patch', `/steps/${step.id}`, { body });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'validation.failed' });
    expect(await stepsOf()).toEqual([step]);
  });
});
