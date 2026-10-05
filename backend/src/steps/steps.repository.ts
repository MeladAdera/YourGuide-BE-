import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { onlyRow } from '../database/only-row.js';
import { CreateStepDto } from './dto/create-step.dto.js';
import { Step } from './dto/step.dto.js';
import { UpdateStepDto } from './dto/update-step.dto.js';

/** One row of `steps`, as PostgreSQL returns it. */
interface StepRow {
  id: string;
  task_id: string;
  title: string;
  done_at: Date | null;
  created_at: Date;
}

// `position` is not here on purpose: it orders the list and stays inside
// the database (see Step).
const COLUMNS = 'id, task_id, title, done_at, created_at';

/**
 * Every method takes `userId` and every statement has `user_id = $1` in its
 * WHERE. A step that belongs to someone else is simply not found: the
 * methods that change one step return `undefined` (or `false`) for it.
 */
@Injectable()
export class StepsRepository {
  /** The steps of one task, in their order. */
  async list(
    executor: Executor,
    userId: string,
    taskId: string,
  ): Promise<Step[]> {
    const { rows } = await executor.query<StepRow>(
      `SELECT ${COLUMNS} FROM steps
        WHERE task_id = $2 AND user_id = $1
        ORDER BY position`,
      [userId, taskId],
    );
    return rows.map(toStep);
  }

  /**
   * The new step goes last: the highest position of the task, plus one.
   * After a delete the numbers have a gap, and "highest plus one" still
   * puts the new step last.
   *
   * The caller holds the task (TasksRepository.lock). Without that, two
   * adds at the same moment would read the same highest position, and the
   * UNIQUE (task_id, position) constraint would refuse the second.
   */
  async create(
    executor: Executor,
    userId: string,
    taskId: string,
    input: CreateStepDto,
  ): Promise<Step> {
    const { rows } = await executor.query<StepRow>(
      `INSERT INTO steps (user_id, task_id, title, position)
       VALUES (
         $1, $2, $3,
         (SELECT COALESCE(max(position), 0) + 1 FROM steps
           WHERE task_id = $2 AND user_id = $1)
       )
       RETURNING ${COLUMNS}`,
      [userId, taskId, input.title],
    );
    return toStep(onlyRow(rows, 'INSERT INTO steps'));
  }

  /**
   * Changes only what was sent, in one statement. "Not sent" travels as
   * NULL for both fields: neither can be set to NULL by the client.
   *
   * Done keeps the first time: marking a step that is already done changes
   * nothing, so repeating the call does not move the step to another day.
   */
  async update(
    executor: Executor,
    userId: string,
    stepId: string,
    input: UpdateStepDto,
  ): Promise<Step | undefined> {
    const { rows } = await executor.query<StepRow>(
      `UPDATE steps
          SET title = COALESCE($3::text, title),
              done_at = CASE
                          WHEN $4::boolean IS NULL THEN done_at
                          WHEN $4::boolean THEN COALESCE(done_at, now())
                          ELSE NULL
                        END
        WHERE id = $2 AND user_id = $1
        RETURNING ${COLUMNS}`,
      [userId, stepId, input.title ?? null, input.done ?? null],
    );
    const row = rows[0];
    return row === undefined ? undefined : toStep(row);
  }

  /**
   * True when a row was deleted. PostgreSQL throws a foreign-key violation
   * instead when the step has a session (see SESSION_STEP_FK).
   */
  async delete(
    executor: Executor,
    userId: string,
    stepId: string,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      'DELETE FROM steps WHERE id = $2 AND user_id = $1',
      [userId, stepId],
    );
    return (rowCount ?? 0) > 0;
  }
}

function toStep(row: StepRow): Step {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    doneAt: row.done_at,
    createdAt: row.created_at,
  };
}
