import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { Session } from './dto/session.dto.js';

/** A session with the names around it, as PostgreSQL returns it. */
interface SessionRow {
  id: string;
  started_at: Date;
  step_id: string;
  step_title: string;
  task_id: string;
  task_title: string;
  goal_id: string;
  goal_title: string;
}

/**
 * Every method takes `userId` and every statement names the user. A
 * session that belongs to someone else is simply not found.
 */
@Injectable()
export class SessionsRepository {
  /**
   * Starts a session on a step, now. `started_at` is the database's clock
   * (the column's default), never a time from the client.
   *
   * The caller has checked that the step belongs to this user and holds it
   * (StepsRepository.findLocked): the foreign key only proves that the
   * step exists, not whose it is.
   *
   * PostgreSQL throws a unique violation when the user already has a
   * running session (see ONE_ACTIVE_SESSION).
   */
  async start(
    executor: Executor,
    userId: string,
    stepId: string,
  ): Promise<void> {
    await executor.query(
      'INSERT INTO sessions (user_id, step_id) VALUES ($1, $2)',
      [userId, stepId],
    );
  }

  /**
   * The user's running session, or undefined. There is never more than
   * one: the unique index sees to that. The step, task and goal are joined
   * in for their titles.
   */
  async findActive(
    executor: Executor,
    userId: string,
  ): Promise<Session | undefined> {
    const { rows } = await executor.query<SessionRow>(
      `SELECT sessions.id, sessions.started_at,
              steps.id AS step_id, steps.title AS step_title,
              tasks.id AS task_id, tasks.title AS task_title,
              goals.id AS goal_id, goals.title AS goal_title
         FROM sessions
         JOIN steps ON steps.id = sessions.step_id
         JOIN tasks ON tasks.id = steps.task_id
         JOIN goals ON goals.id = tasks.goal_id
        WHERE sessions.user_id = $1 AND sessions.ended_at IS NULL`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toSession(row);
  }
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    step: { id: row.step_id, title: row.step_title },
    task: { id: row.task_id, title: row.task_title },
    goal: { id: row.goal_id, title: row.goal_title },
  };
}
