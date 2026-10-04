import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { onlyRow } from '../database/only-row.js';
import { Goal } from './dto/goal.dto.js';

/** One row of `goals`, as PostgreSQL returns it. */
interface GoalRow {
  id: string;
  title: string;
  created_at: Date;
  archived_at: Date | null;
}

const COLUMNS = 'id, title, created_at, archived_at';

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

  async create(
    executor: Executor,
    userId: string,
    title: string,
  ): Promise<Goal> {
    const { rows } = await executor.query<GoalRow>(
      `INSERT INTO goals (user_id, title) VALUES ($1, $2)
       RETURNING ${COLUMNS}`,
      [userId, title],
    );
    return toGoal(onlyRow(rows, 'INSERT INTO goals'));
  }

  async rename(
    executor: Executor,
    userId: string,
    goalId: string,
    title: string,
  ): Promise<Goal | undefined> {
    const { rows } = await executor.query<GoalRow>(
      `UPDATE goals SET title = $3
        WHERE id = $2 AND user_id = $1
        RETURNING ${COLUMNS}`,
      [userId, goalId, title],
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
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}
