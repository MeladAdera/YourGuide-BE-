import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { onlyRow } from '../database/only-row.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { Task } from './dto/task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import type { TaskStatus } from './task-status.js';

/** One row of `tasks`, with the status read from its steps. */
interface TaskRow {
  id: string;
  goal_id: string;
  title: string;
  status: TaskStatus;
  created_at: Date;
}

/**
 * The status is not a column. It is read from the task's steps every time:
 *
 *   no step done (or no steps yet)   todo
 *   some steps done, not all         in_progress
 *   every step done                  done
 *
 * A stored status would be a second copy of what the steps already say,
 * and the two could disagree. A count without GROUP BY always gives one
 * row, also for a task with no steps, so this never yields NULL.
 * SCHEMA.md §7.
 */
const STATUS = `(
  SELECT CASE
           WHEN count(*) FILTER (WHERE done_at IS NOT NULL) = 0 THEN 'todo'
           WHEN count(*) FILTER (WHERE done_at IS NULL) = 0 THEN 'done'
           ELSE 'in_progress'
         END
    FROM steps
   WHERE steps.task_id = tasks.id
)`;

// Used after SELECT and after RETURNING alike: PostgreSQL lets RETURNING
// run a subquery on the row it has just written.
const COLUMNS = `id, goal_id, title, ${STATUS} AS status, created_at`;

/**
 * Every method takes `userId` and every statement has `user_id = $1` in its
 * WHERE. A task that belongs to someone else is simply not found: the
 * methods that change one task return `undefined` (or `false`) for it.
 */
@Injectable()
export class TasksRepository {
  /** The tasks of one goal, oldest first. */
  async list(
    executor: Executor,
    userId: string,
    goalId: string,
  ): Promise<Task[]> {
    const { rows } = await executor.query<TaskRow>(
      `SELECT ${COLUMNS} FROM tasks
        WHERE goal_id = $2 AND user_id = $1
        ORDER BY created_at, id`,
      [userId, goalId],
    );
    return rows.map(toTask);
  }

  /** One task, or undefined when there is none or it is someone else's. */
  async find(
    executor: Executor,
    userId: string,
    taskId: string,
  ): Promise<Task | undefined> {
    const { rows } = await executor.query<TaskRow>(
      `SELECT ${COLUMNS} FROM tasks WHERE id = $2 AND user_id = $1`,
      [userId, taskId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toTask(row);
  }

  /**
   * Holds the task until the transaction ends: a second request that asks
   * for the same lock waits. For adding a step, where "which position is
   * next?" and the INSERT must not be interleaved with another add.
   * False when the task is not there or is someone else's. Only inside
   * `withTransaction`.
   */
  async lock(
    executor: Executor,
    userId: string,
    taskId: string,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      'SELECT 1 FROM tasks WHERE id = $2 AND user_id = $1 FOR UPDATE',
      [userId, taskId],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * The caller has already checked that the goal belongs to this user:
   * the foreign key only proves the goal exists, not whose it is.
   */
  async create(
    executor: Executor,
    userId: string,
    goalId: string,
    input: CreateTaskDto,
  ): Promise<Task> {
    const { rows } = await executor.query<TaskRow>(
      `INSERT INTO tasks (user_id, goal_id, title)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [userId, goalId, input.title],
    );
    return toTask(onlyRow(rows, 'INSERT INTO tasks'));
  }

  /** "Not sent" travels as NULL, and COALESCE keeps the old title. */
  async update(
    executor: Executor,
    userId: string,
    taskId: string,
    input: UpdateTaskDto,
  ): Promise<Task | undefined> {
    const { rows } = await executor.query<TaskRow>(
      `UPDATE tasks SET title = COALESCE($3::text, title)
        WHERE id = $2 AND user_id = $1
        RETURNING ${COLUMNS}`,
      [userId, taskId, input.title ?? null],
    );
    const row = rows[0];
    return row === undefined ? undefined : toTask(row);
  }

  /**
   * True when a row was deleted. The delete cascades to the task's steps;
   * PostgreSQL throws a foreign-key violation instead when one of those
   * steps has a session (see SESSION_STEP_FK).
   */
  async delete(
    executor: Executor,
    userId: string,
    taskId: string,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      'DELETE FROM tasks WHERE id = $2 AND user_id = $1',
      [userId, taskId],
    );
    return (rowCount ?? 0) > 0;
  }
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    goalId: row.goal_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at,
  };
}
