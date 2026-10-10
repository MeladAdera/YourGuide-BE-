import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import { isUniqueViolation } from '../database/pg-errors.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { requireActive } from '../goals/require-active.js';
import { StepsRepository } from '../steps/steps.repository.js';
import { EndSessionDto } from './dto/end-session.dto.js';
import { EndedSession, Session } from './dto/session.dto.js';
import { StartSessionDto } from './dto/start-session.dto.js';
import { ONE_ACTIVE_SESSION } from './session-constraints.js';
import { SessionsRepository } from './sessions.repository.js';

/**
 * A focus session is the record that work happened: on which step, from
 * when until when, and how it went. It has three states. Running: the
 * clock counts. Awaiting review: the clock has stopped, the review is
 * still owed. Completed: reviewed. The first two are "active": while one
 * exists, no other session starts and the goal above it is not archived.
 * Nothing closes a session but the user, and nothing discards one.
 *
 * Starting one is a write under a goal, so it has the shape of every
 * other write under a goal: one transaction that locks the goal, asks the
 * two questions in `requireActive` (yours? active?), then writes.
 *
 * Nothing here touches the task's status. Only a step marked done moves
 * it, and the one way a session does that is outcome `done` on review.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sessions: SessionsRepository,
    private readonly steps: StepsRepository,
    private readonly goals: GoalsRepository,
  ) {}

  /** The active session, running or awaiting review, or 404. */
  async active(userId: string): Promise<Session> {
    return found(await this.sessions.findActive(this.db.pool, userId));
  }

  /**
   * Four questions, in this order: is the step yours (404), is its goal
   * active (409), is the step still open (409), is no other session
   * active (409)?
   *
   * The first three are asked here, on rows that stay as they were read
   * until the transaction ends. The goal's lock keeps it from being
   * archived while the session starts. The step's keeps it from being
   * deleted; it comes back undefined when the step was deleted after the
   * goal was read: still 404.
   *
   * The fourth is not asked at all. "Is a session active?" followed by an
   * insert has a gap, and a double click fits in it. The unique index has
   * none: PostgreSQL refuses the second active session, and that refusal
   * is the 409.
   *
   * The answer is read with the statement GET /sessions/active uses, so
   * the two can never differ.
   */
  async start(userId: string, input: StartSessionDto): Promise<Session> {
    try {
      return await this.db.withTransaction(async (client) => {
        const goal = await this.goals.findLockedOfStep(
          client,
          userId,
          input.stepId,
        );
        requireActive(goal, 'step.not_found');
        const step = await this.steps.findLocked(client, userId, input.stepId);
        if (step === undefined) {
          throw new ApiError('step.not_found');
        }
        if (step.doneAt !== null) {
          throw new ApiError('session.step_done');
        }
        await this.sessions.start(client, userId, input.stepId);
        return found(await this.sessions.findActive(client, userId));
      });
    } catch (error) {
      if (isUniqueViolation(error, ONE_ACTIVE_SESSION)) {
        throw new ApiError('session.already_active');
      }
      throw error;
    }
  }

  /**
   * Stops the clock without a review: "Later" on the review screen. The
   * session is then awaiting its review, which still counts as active.
   * The repository's one UPDATE asks and acts at once: no row means there
   * is no running session with this id for this user, and the answer is
   * 404 whether it never existed, is someone else's or has already been
   * stopped.
   */
  async stop(userId: string, sessionId: string): Promise<Session> {
    const stopped = await this.sessions.stop(this.db.pool, userId, sessionId);
    if (stopped === undefined) {
      throw new ApiError('session.not_running');
    }
    return stopped;
  }

  /**
   * Completes a session with its review, whether it is running or was
   * stopped earlier. The repository's one UPDATE asks and acts at once: no
   * row means there is no unreviewed session with this id for this user,
   * and the answer is 404 whether it never existed, is someone else's or
   * has already been reviewed.
   *
   * Outcome `done` also marks the step done, in the same transaction: the
   * session is completed and the step is done, or neither happens. The
   * step takes the time the clock stopped, not the time of the review,
   * and keeps an earlier time if it was ticked while the session ran. The
   * task's status follows by itself, as always.
   *
   * No goal lock here, although marking a step is a write under a goal.
   * A goal cannot be archived while a session under it is unreviewed, and
   * this one is unreviewed until this transaction commits.
   */
  end(
    userId: string,
    sessionId: string,
    input: EndSessionDto,
  ): Promise<EndedSession> {
    return this.db.withTransaction(async (client) => {
      const ended = await this.sessions.end(client, userId, sessionId, input);
      if (ended === undefined) {
        throw new ApiError('session.not_found');
      }
      if (input.outcome === 'done') {
        await this.sessions.markStepDone(client, userId, sessionId);
      }
      return ended;
    });
  }
}

function found(session: Session | undefined): Session {
  if (session === undefined) {
    throw new ApiError('session.none_active');
  }
  return session;
}
