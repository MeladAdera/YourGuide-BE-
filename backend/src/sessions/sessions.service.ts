import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import { isUniqueViolation } from '../database/pg-errors.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { requireActive } from '../goals/require-active.js';
import { StepsRepository } from '../steps/steps.repository.js';
import { Session } from './dto/session.dto.js';
import { StartSessionDto } from './dto/start-session.dto.js';
import { ONE_ACTIVE_SESSION } from './session-constraints.js';
import { SessionsRepository } from './sessions.repository.js';

/**
 * A focus session is the record that work happened: on which step, from
 * when. Starting one is a write under a goal, so it has the shape of every
 * other write under a goal: one transaction that locks the goal, asks the
 * two questions in `requireActive` (yours? active?), then writes.
 *
 * Nothing here touches the step or the task's status. Starting work is not
 * finishing it; only a step marked done moves a task.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sessions: SessionsRepository,
    private readonly steps: StepsRepository,
    private readonly goals: GoalsRepository,
  ) {}

  /** The running session, or 404 when nothing is running. */
  async active(userId: string): Promise<Session> {
    return running(await this.sessions.findActive(this.db.pool, userId));
  }

  /**
   * Four questions, in this order: is the step yours (404), is its goal
   * active (409), is the step still open (409), is nothing else running
   * (409)?
   *
   * The first three are asked here, on rows that stay as they were read
   * until the transaction ends. The goal's lock keeps it from being
   * archived while the session starts. The step's keeps it from being
   * deleted; it comes back undefined when the step was deleted after the
   * goal was read: still 404.
   *
   * The fourth is not asked at all. "Is a session running?" followed by an
   * insert has a gap, and a double click fits in it. The unique index has
   * none: PostgreSQL refuses the second running session, and that refusal
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
        return running(await this.sessions.findActive(client, userId));
      });
    } catch (error) {
      if (isUniqueViolation(error, ONE_ACTIVE_SESSION)) {
        throw new ApiError('session.already_active');
      }
      throw error;
    }
  }
}

function running(session: Session | undefined): Session {
  if (session === undefined) {
    throw new ApiError('session.none_active');
  }
  return session;
}
