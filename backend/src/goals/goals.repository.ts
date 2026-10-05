import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { onlyRow } from '../database/only-row.js';
import { CreateGoalDto } from './dto/create-goal.dto.js';
import { Goal } from './dto/goal.dto.js';
import { UpdateGoalDto } from './dto/update-goal.dto.js';

/** One row of `goals`, as PostgreSQL returns it. */
interface GoalRow {
  id: string;
  title: string;
  why_it_matters: string;
  obstacle: string | null;
  first_outcome: string | null;
  created_at: Date;
  archived_at: Date | null;
}

const COLUMNS =
  'id, title, why_it_matters, obstacle, first_outcome, created_at, archived_at';

/**
 * Every method takes `userId` and every statement has `user_id = $n` in its
 * WHERE. A goal that belongs to someone else is simply not found: the
 * methods that change one goal return `undefined` (or `false`) for it.
 */
@Injectable()
export class GoalsRepository {
  /** Active goals, or archived ones, oldest first. */
  async list(
    executor: Executor,
    userId: string,
    archived: boolean,
  ): Promise<Goal[]> {
    const { rows } = await executor.query<GoalRow>(
      `SELECT ${COLUMNS} FROM goals
        WHERE user_id = $1 AND (archived_at IS NOT NULL) = $2
        ORDER BY created_at, id`,
      [userId, archived],
    );
    return rows.map(toGoal);
  }

  /** One goal, or undefined when there is none or it is someone else's. */
  async find(
    executor: Executor,
    userId: string,
    goalId: string,
  ): Promise<Goal | undefined> {
    const { rows } = await executor.query<GoalRow>(
      `SELECT ${COLUMNS} FROM goals WHERE id = $2 AND user_id = $1`,
      [userId, goalId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toGoal(row);
  }

  /**
   * The same read, and the goal then stays as it was read until the
   * transaction ends: FOR SHARE makes an archive or a delete of this goal
   * wait. For changing something under a goal, where "is it mine, is it
   * active?" and the write must see the same goal. Only inside
   * `withTransaction`; on the pool the lock would end with the statement.
   */
  async findLocked(
    executor: Executor,
    userId: string,
    goalId: string,
  ): Promise<Goal | undefined> {
    const { rows } = await executor.query<GoalRow>(
      `SELECT ${COLUMNS} FROM goals WHERE id = $2 AND user_id = $1 FOR SHARE`,
      [userId, goalId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toGoal(row);
  }

  /**
   * The goal a task is under, held as `findLocked` holds it. Undefined when
   * the task does not exist or is someone else's. For changing something
   * under a goal when only the task's id is known.
   */
  async findLockedOfTask(
    executor: Executor,
    userId: string,
    taskId: string,
  ): Promise<Goal | undefined> {
    const { rows } = await executor.query<GoalRow>(
      `SELECT ${COLUMNS} FROM goals
        WHERE id = (SELECT goal_id FROM tasks WHERE id = $2 AND user_id = $1)
          AND user_id = $1
        FOR SHARE`,
      [userId, taskId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toGoal(row);
  }

  async create(
    executor: Executor,
    userId: string,
    input: CreateGoalDto,
  ): Promise<Goal> {
    const { rows } = await executor.query<GoalRow>(
      `INSERT INTO goals (
         user_id, title, why_it_matters, obstacle, first_outcome
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.title,
        input.whyItMatters,
        input.obstacle ?? null,
        input.firstOutcome ?? null,
      ],
    );
    return toGoal(onlyRow(rows, 'INSERT INTO goals'));
  }

  /**
   * Changes only what was sent, in one statement.
   *
   * The two required answers cannot be cleared, so "not sent" can travel
   * as NULL and COALESCE keeps the old value.
   *
   * The two optional answers can be cleared, so NULL already means
   * something ("clear it") and cannot also mean "not sent". Each one
   * travels as a pair: a flag saying whether it was sent, and the value.
   */
  async update(
    executor: Executor,
    userId: string,
    goalId: string,
    input: UpdateGoalDto,
  ): Promise<Goal | undefined> {
    const { rows } = await executor.query<GoalRow>(
      `UPDATE goals
          SET title = COALESCE($3::text, title),
              why_it_matters = COALESCE($4::text, why_it_matters),
              obstacle = CASE WHEN $5::boolean THEN $6::text ELSE obstacle END,
              first_outcome =
                CASE WHEN $7::boolean THEN $8::text ELSE first_outcome END
        WHERE id = $2 AND user_id = $1
        RETURNING ${COLUMNS}`,
      [
        userId,
        goalId,
        input.title ?? null,
        input.whyItMatters ?? null,
        input.obstacle !== undefined,
        input.obstacle ?? null,
        input.firstOutcome !== undefined,
        input.firstOutcome ?? null,
      ],
    );
    const row = rows[0];
    return row === undefined ? undefined : toGoal(row);
  }

  /**
   * COALESCE keeps the first timestamp: archiving a goal that is already
   * archived changes nothing, so the call can safely be repeated.
   */
  async archive(
    executor: Executor,
    userId: string,
    goalId: string,
  ): Promise<Goal | undefined> {
    const { rows } = await executor.query<GoalRow>(
      `UPDATE goals SET archived_at = COALESCE(archived_at, now())
        WHERE id = $2 AND user_id = $1
        RETURNING ${COLUMNS}`,
      [userId, goalId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toGoal(row);
  }

  async unarchive(
    executor: Executor,
    userId: string,
    goalId: string,
  ): Promise<Goal | undefined> {
    const { rows } = await executor.query<GoalRow>(
      `UPDATE goals SET archived_at = NULL
        WHERE id = $2 AND user_id = $1
        RETURNING ${COLUMNS}`,
      [userId, goalId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toGoal(row);
  }

  /**
   * True when a row was deleted. The delete cascades to the goal's tasks
   * and steps; PostgreSQL throws a foreign-key violation instead when one
   * of those steps has a session (see SESSION_STEP_FK).
   */
  async delete(
    executor: Executor,
    userId: string,
    goalId: string,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      'DELETE FROM goals WHERE id = $2 AND user_id = $1',
      [userId, goalId],
    );
    return (rowCount ?? 0) > 0;
  }
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    whyItMatters: row.why_it_matters,
    obstacle: row.obstacle,
    firstOutcome: row.first_outcome,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}
