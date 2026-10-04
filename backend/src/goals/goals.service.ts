import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { isForeignKeyViolation } from '../database/pg-errors.js';
import {
  HAS_WORK_HISTORY,
  SESSION_STEP_FK,
} from '../sessions/session-constraints.js';
import { Goal } from './dto/goal.dto.js';
import { GoalTitleDto } from './dto/goal-title.dto.js';
import { GoalsRepository } from './goals.repository.js';

@Injectable()
export class GoalsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly goals: GoalsRepository,
  ) {}

  list(userId: string, archived: boolean): Promise<Goal[]> {
    return this.goals.list(this.db.pool, userId, archived);
  }

  create(userId: string, input: GoalTitleDto): Promise<Goal> {
    return this.goals.create(this.db.pool, userId, input.title);
  }

  rename(userId: string, goalId: string, input: GoalTitleDto): Promise<Goal> {
    return found(this.goals.rename(this.db.pool, userId, goalId, input.title));
  }

  archive(userId: string, goalId: string): Promise<Goal> {
    return found(this.goals.archive(this.db.pool, userId, goalId));
  }

  unarchive(userId: string, goalId: string): Promise<Goal> {
    return found(this.goals.unarchive(this.db.pool, userId, goalId));
  }

  /**
   * A goal with no work history is deleted, with its tasks and steps.
   * A goal with history is not: the database refuses, and the answer is
   * 409 "archive it instead", so progress is never lost by a delete.
   *
   * There is no "does it have sessions?" check before the delete. A check
   * in code has a gap between the check and the write; the foreign key
   * has none.
   */
  async delete(userId: string, goalId: string): Promise<void> {
    let deleted: boolean;
    try {
      deleted = await this.goals.delete(this.db.pool, userId, goalId);
    } catch (error) {
      if (isForeignKeyViolation(error, SESSION_STEP_FK)) {
        throw new ConflictException(
          `${HAS_WORK_HISTORY} Archive the goal instead.`,
        );
      }
      throw error;
    }
    if (!deleted) {
      throw new NotFoundException(NOT_FOUND);
    }
  }
}

const NOT_FOUND = 'Goal not found.';

/**
 * Turns "no row" into 404. The goal does not exist, or it belongs to
 * someone else; the answer is the same on purpose.
 */
async function found(lookup: Promise<Goal | undefined>): Promise<Goal> {
  const goal = await lookup;
  if (goal === undefined) {
    throw new NotFoundException(NOT_FOUND);
  }
  return goal;
}
