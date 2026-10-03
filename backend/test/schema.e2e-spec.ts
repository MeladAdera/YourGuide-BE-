import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp } from './helpers/create-test-app.js';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

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
      'INSERT INTO users (email, password_hash, timezone) VALUES ($1, $2, $3)',
      [email, 'hash', 'UTC'],
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
      'INSERT INTO goals (user_id, title) VALUES ($1, $2)',
      [userId, 'Goal'],
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

  it('has the 16 tables from SCHEMA.md', async () => {
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
      'profiles',
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

  it('deleting a goal deletes its tasks, steps and sessions', async () => {
    const { userId, goalId, stepId } = await insertStep();
    await insertSession(userId, stepId);

    await pool.query('DELETE FROM goals WHERE id = $1', [goalId]);

    expect(await count('tasks')).toBe(0);
    expect(await count('steps')).toBe(0);
    expect(await count('sessions')).toBe(0);
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
