import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { EndSessionDto } from './dto/end-session.dto.js';
import { EndedSession, Session } from './dto/session.dto.js';
import type { SessionOutcome } from './session-outcome.js';

/** An active session with the names around it, as PostgreSQL returns it. */
interface SessionRow {
  id: string;
  started_at: Date;
  ended_at: Date | null;
  step_id: string;
  step_title: string;
  task_id: string;
  task_title: string;
  goal_id: string;
  goal_title: string;
}

/** The row `end` returns: the review is what that statement just wrote. */
interface EndedSessionRow extends SessionRow {
  ended_at: Date;
  outcome: SessionOutcome;
  rating: number;
  note: string | null;
}

// An active session's answer: its times, and the step it is on with the
// task and goal above it, by name.
const SESSION = `sessions.id, sessions.started_at, sessions.ended_at,
                 steps.id AS step_id, steps.title AS step_title,
                 tasks.id AS task_id, tasks.title AS task_title,
                 goals.id AS goal_id, goals.title AS goal_title`;

// Where those names come from, for an UPDATE's FROM. The session is matched
// to its step in the WHERE.
const AROUND = `steps
         JOIN tasks ON tasks.id = steps.task_id
         JOIN goals ON goals.id = tasks.goal_id`;

/**
 * Every method takes `userId` and every statement names the user. A
 * session that belongs to someone else is simply not found.
 *
 * A session is active until it is reviewed: `outcome IS NULL`. It is
 * running while `ended_at IS NULL`; stopped and awaiting its review once
 * `ended_at` is set.
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
   * PostgreSQL throws a unique violation when the user already has an
   * active session (see ONE_ACTIVE_SESSION).
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
   * The user's active session, or undefined. There is never more than
   * one: the unique index sees to that. The step, task and goal are joined
   * in for their titles.
   */
  async findActive(
    executor: Executor,
    userId: string,
  ): Promise<Session | undefined> {
    const { rows } = await executor.query<SessionRow>(
      `SELECT ${SESSION}
         FROM sessions
         JOIN steps ON steps.id = sessions.step_id
         JOIN tasks ON tasks.id = steps.task_id
         JOIN goals ON goals.id = tasks.goal_id
        WHERE sessions.user_id = $1 AND sessions.outcome IS NULL`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toSession(row);
  }

  /**
   * The completed sessions that started in the last `days` of the user's
   * days, newest first, each with its review. The same window as
   * progress: from the first instant of the first local day on, so the
   * list for a week holds exactly the sessions progress counted for it,
   * minus any still awaiting its review. The (user_id, started_at) index
   * does the work.
   */
  async listCompleted(
    executor: Executor,
    userId: string,
    days: number,
  ): Promise<EndedSession[]> {
    const { rows } = await executor.query<EndedSessionRow>(
      `SELECT ${SESSION}, sessions.outcome, sessions.rating, sessions.note
         FROM sessions
         JOIN steps ON steps.id = sessions.step_id
         JOIN tasks ON tasks.id = steps.task_id
         JOIN goals ON goals.id = tasks.goal_id
         JOIN users ON users.id = sessions.user_id
        WHERE sessions.user_id = $1
          AND sessions.outcome IS NOT NULL
          AND sessions.started_at >= (
                ((now() AT TIME ZONE users.timezone)::date - ($2::int - 1))::timestamp
                AT TIME ZONE users.timezone
              )
        ORDER BY sessions.started_at DESC`,
      [userId, days],
    );
    return rows.map(toEndedSession);
  }

  /**
   * Stops the clock of a running session, now, without a review. The
   * session is then awaiting its review.
   *
   * Undefined when the user has no running session with this id: there is
   * no such session, it is someone else's, or its clock has already
   * stopped. "Is it still running?" is part of the UPDATE itself, so a
   * second stop at the same moment finds nothing left to stop.
   */
  async stop(
    executor: Executor,
    userId: string,
    sessionId: string,
  ): Promise<Session | undefined> {
    const { rows } = await executor.query<SessionRow>(
      `UPDATE sessions
          SET ended_at = now()
         FROM ${AROUND}
        WHERE sessions.id = $2 AND sessions.user_id = $1
          AND sessions.ended_at IS NULL
          AND steps.id = sessions.step_id
        RETURNING ${SESSION}`,
      [userId, sessionId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toSession(row);
  }

  /**
   * Completes a session with its review, in one statement. A running
   * session ends now; a stopped one keeps the time its clock stopped. The
   * time is the database's, like `started_at`.
   *
   * Undefined when the user has no unreviewed session with this id: there
   * is no such session, it is someone else's, or it has already been
   * reviewed. The three look the same on purpose, and "is it still
   * unreviewed?" is part of the UPDATE itself, so a second end at the same
   * moment finds nothing left to end.
   *
   * The FROM joins the step, task and goal in, so the statement that
   * completes the session also returns the answer.
   */
  async end(
    executor: Executor,
    userId: string,
    sessionId: string,
    input: EndSessionDto,
  ): Promise<EndedSession | undefined> {
    const { rows } = await executor.query<EndedSessionRow>(
      `UPDATE sessions
          SET ended_at = COALESCE(sessions.ended_at, now()),
              outcome = $3, rating = $4, note = $5
         FROM ${AROUND}
        WHERE sessions.id = $2 AND sessions.user_id = $1
          AND sessions.outcome IS NULL
          AND steps.id = sessions.step_id
        RETURNING ${SESSION}, sessions.outcome, sessions.rating, sessions.note`,
      [userId, sessionId, input.outcome, input.rating, input.note ?? null],
    );
    const row = rows[0];
    return row === undefined ? undefined : toEndedSession(row);
  }

  /**
   * Marks the step of a session done, at the time the session's clock
   * stopped: the work was finished then, not when the review was written,
   * which may be the next day. Done keeps the first time, as PATCH
   * /steps/:id does, so a step ticked while the session ran stays on that
   * time. The step is there: one with a session cannot be deleted.
   */
  async markStepDone(
    executor: Executor,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    await executor.query(
      `UPDATE steps
          SET done_at = COALESCE(steps.done_at, sessions.ended_at)
         FROM sessions
        WHERE sessions.id = $2 AND sessions.user_id = $1
          AND steps.id = sessions.step_id AND steps.user_id = $1`,
      [userId, sessionId],
    );
  }
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    step: { id: row.step_id, title: row.step_title },
    task: { id: row.task_id, title: row.task_title },
    goal: { id: row.goal_id, title: row.goal_title },
  };
}

function toEndedSession(row: EndedSessionRow): EndedSession {
  const { id, startedAt, step, task, goal } = toSession(row);
  return {
    id,
    startedAt,
    endedAt: row.ended_at,
    outcome: row.outcome,
    rating: row.rating,
    note: row.note,
    step,
    task,
    goal,
  };
}
