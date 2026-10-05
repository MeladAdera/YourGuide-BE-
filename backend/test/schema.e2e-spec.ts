import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const NOT_NULL_VIOLATION = '23502';

// Proves the database enforces the business rules listed in SCHEMA.md §16.
describe('Database schema', () => {
  let app: INestApplication;
  let pool: Pool;

  async function insertReturningId(
    sql: string,
    values: unknown[],
  ): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `${sql} RETURNING id`,
      values,
    );
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Insert returned no row');
    }
    return row.id;
  }

  function insertUser(email = 'user@example.com'): Promise<string> {
    return insertReturningId(
      'INSERT INTO users (email, password_hash, timezone, locale) VALUES ($1, $2, $3, $4)',
      [email, 'hash', 'UTC', 'en'],
    );
  }

  /** One user with a goal, a task and a step. */
  async function insertStep(): Promise<{
    userId: string;
    goalId: string;
    taskId: string;
    stepId: string;
  }> {
    const userId = await insertUser();
    const goalId = await insertReturningId(
      'INSERT INTO goals (user_id, title, why_it_matters) VALUES ($1, $2, $3)',
      [userId, 'Goal', 'Why'],
    );
    const taskId = await insertReturningId(
      'INSERT INTO tasks (user_id, goal_id, title) VALUES ($1, $2, $3)',
      [userId, goalId, 'Task'],
    );
    const stepId = await insertReturningId(
      'INSERT INTO steps (user_id, task_id, title, position) VALUES ($1, $2, $3, 1)',
      [userId, taskId, 'Step'],
    );
    return { userId, goalId, taskId, stepId };
  }

  function insertSession(userId: string, stepId: string): Promise<string> {
    return insertReturningId(
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

  it('has the 15 tables from SCHEMA.md', async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> 'pgmigrations'
        ORDER BY tablename`,
    );

    expect(rows.map((row) => row.tablename)).toEqual([
      'auth_sessions',
      'goals',
      'profile_achievements',
      'profile_basics',
      'profile_confidence',
      'profile_meaning',
      'profile_patterns',
      'profile_self_view',
      'profile_situation',
      'profile_values',
      'sessions',
      'steps',
      'struggles',
      'tasks',
      'users',
    ]);
  });

  it('rejects an onboarding option outside its list', async () => {
    const userId = await insertUser();

    await expect(
      pool.query(
        `INSERT INTO profile_basics (user_id, employment_status)
         VALUES ($1, 'freelancer')`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(
      pool.query(
        `INSERT INTO profile_basics (user_id, employment_status, country)
         VALUES ($1, 'employed', 'Dubai')`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('rejects a confidence answer outside 1–5', async () => {
    const userId = await insertUser();

    await expect(
      pool.query(
        `INSERT INTO profile_confidence (
           user_id, can_learn_if_persist, can_try_again, follow_through,
           focus_without_motivation, actions_shape_future,
           doubt_despite_evidence, avoid_when_afraid, compare_too_much
         ) VALUES ($1, 4, 4, 4, 4, 4, 2, 2, 6)`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('rejects the same value picked twice and an unknown value', async () => {
    const userId = await insertUser();
    await pool.query(
      "INSERT INTO profile_values (user_id, value) VALUES ($1, 'health')",
      [userId],
    );

    await expect(
      pool.query(
        "INSERT INTO profile_values (user_id, value) VALUES ($1, 'health')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    await expect(
      pool.query(
        "INSERT INTO profile_values (user_id, value) VALUES ($1, 'fame')",
        [userId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('deleting a user deletes their onboarding screens', async () => {
    const userId = await insertUser();
    await pool.query(
      "INSERT INTO profile_basics (user_id, employment_status) VALUES ($1, 'student')",
      [userId],
    );
    await pool.query(
      "INSERT INTO profile_values (user_id, value) VALUES ($1, 'learning')",
      [userId],
    );

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    expect(await count('profile_basics')).toBe(0);
    expect(await count('profile_values')).toBe(0);
  });

  it('rejects a language outside the list, and a user without one', async () => {
    await expect(
      pool.query(
        `INSERT INTO users (email, password_hash, timezone, locale)
         VALUES ('a@example.com', 'hash', 'UTC', 'fr')`,
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    // No default: an INSERT that forgets the language fails, it does not
    // quietly get English.
    await expect(
      pool.query(
        `INSERT INTO users (email, password_hash, timezone)
         VALUES ('a@example.com', 'hash', 'UTC')`,
      ),
    ).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });
  });

  it('rejects the same email in a different letter case', async () => {
    await insertUser('foo@example.com');

    await expect(insertUser('Foo@Example.com')).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it('rejects two steps with the same position in one task', async () => {
    const { userId, taskId } = await insertStep();

    await expect(
      pool.query(
        'INSERT INTO steps (user_id, task_id, title, position) VALUES ($1, $2, $3, 1)',
        [userId, taskId, 'Same position'],
      ),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('lets one statement swap the positions of two steps', async () => {
    const { userId, taskId, stepId } = await insertStep();
    const secondId = await insertReturningId(
      'INSERT INTO steps (user_id, task_id, title, position) VALUES ($1, $2, $3, 2)',
      [userId, taskId, 'Second'],
    );

    // Row by row this collides: the first step moves to 2 while the second
    // still stands there. The constraint is checked when the statement ends.
    await pool.query(
      `UPDATE steps SET position = CASE WHEN id = $1 THEN 2 ELSE 1 END
        WHERE task_id = $2`,
      [stepId, taskId],
    );

    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM steps WHERE task_id = $1 ORDER BY position',
      [taskId],
    );
    expect(rows.map((row) => row.id)).toEqual([secondId, stepId]);
    // "When the statement ends", not "when the transaction ends": a real
    // duplicate is refused by the statement that makes it.
    await expect(
      pool.query('UPDATE steps SET position = 1 WHERE task_id = $1', [taskId]),
    ).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
      constraint: 'steps_task_id_position_key',
    });
  });

  it('rejects a second active session for the same user', async () => {
    const { userId, stepId } = await insertStep();
    await insertSession(userId, stepId);

    await expect(insertSession(userId, stepId)).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
      constraint: 'one_active_session_per_user',
    });
  });

  it('allows a new session after the previous one ended', async () => {
    const { userId, stepId } = await insertStep();
    const first = await insertSession(userId, stepId);
    await pool.query(
      "UPDATE sessions SET ended_at = started_at + interval '25 minutes' WHERE id = $1",
      [first],
    );

    await expect(insertSession(userId, stepId)).resolves.toBeDefined();
  });

  it('rejects a session that ends before it starts', async () => {
    const { userId, stepId } = await insertStep();
    const sessionId = await insertSession(userId, stepId);

    await expect(
      pool.query(
        "UPDATE sessions SET ended_at = started_at - interval '1 minute' WHERE id = $1",
        [sessionId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('rejects a rating outside 1–5', async () => {
    const { userId, stepId } = await insertStep();
    const sessionId = await insertSession(userId, stepId);

    await expect(
      pool.query('UPDATE sessions SET rating = 6 WHERE id = $1', [sessionId]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('rejects an unknown outcome and an unknown situation', async () => {
    const { userId, stepId } = await insertStep();
    const sessionId = await insertSession(userId, stepId);

    await expect(
      pool.query("UPDATE sessions SET outcome = 'bored' WHERE id = $1", [
        sessionId,
      ]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    await expect(
      pool.query(
        `INSERT INTO struggles (user_id, situation, description, advice, next_step)
         VALUES ($1, 'bored', 'd', 'a', 'n')`,
        [userId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('deleting a goal without sessions deletes its tasks and steps', async () => {
    const { goalId } = await insertStep();

    await pool.query('DELETE FROM goals WHERE id = $1', [goalId]);

    expect(await count('tasks')).toBe(0);
    expect(await count('steps')).toBe(0);
  });

  it('refuses to delete a goal, task or step that has a session', async () => {
    const { userId, goalId, taskId, stepId } = await insertStep();
    await insertSession(userId, stepId);

    const targets = [
      ['goals', goalId],
      ['tasks', taskId],
      ['steps', stepId],
    ] as const;
    for (const [table, id] of targets) {
      await expect(
        pool.query(`DELETE FROM ${table} WHERE id = $1`, [id]),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'sessions_step_id_fkey',
      });
    }
    // The refused statement deleted nothing, not even the rows above the step.
    expect(await count('goals')).toBe(1);
    expect(await count('tasks')).toBe(1);
    expect(await count('steps')).toBe(1);
    expect(await count('sessions')).toBe(1);
  });

  it('deleting a user still deletes everything, sessions included', async () => {
    const { userId, stepId } = await insertStep();
    await insertSession(userId, stepId);

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    expect(await count('goals')).toBe(0);
    expect(await count('steps')).toBe(0);
    expect(await count('sessions')).toBe(0);
  });

  it('a new goal is active: archived_at starts as NULL', async () => {
    await insertStep();

    const { rows } = await pool.query<{ archived_at: Date | null }>(
      'SELECT archived_at FROM goals',
    );
    expect(rows).toEqual([{ archived_at: null }]);
  });

  it('stores no status on a task: it is read from the steps', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tasks'
        ORDER BY ordinal_position`,
    );

    expect(rows.map((row) => row.column_name)).toEqual([
      'id',
      'user_id',
      'goal_id',
      'title',
      'created_at',
    ]);
  });

  it('deleting a session keeps its struggle, without the session link', async () => {
    const { userId, stepId } = await insertStep();
    const sessionId = await insertSession(userId, stepId);
    await pool.query(
      `INSERT INTO struggles (user_id, session_id, situation, description, advice, next_step)
       VALUES ($1, $2, 'stuck', 'd', 'a', 'n')`,
      [userId, sessionId],
    );

    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);

    const { rows } = await pool.query<{ session_id: string | null }>(
      'SELECT session_id FROM struggles',
    );
    expect(rows).toEqual([{ session_id: null }]);
  });
});
