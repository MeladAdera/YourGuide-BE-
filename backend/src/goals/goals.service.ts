import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import { isForeignKeyViolation } from '../database/pg-errors.js';
import { ProfileService } from '../profile/profile.service.js';
import { SESSION_STEP_FK } from '../sessions/session-constraints.js';
import { CreateGoalDto } from './dto/create-goal.dto.js';
import { Goal } from './dto/goal.dto.js';
import { UpdateGoalDto } from './dto/update-goal.dto.js';
import { GoalsRepository } from './goals.repository.js';

@Injectable()
export class GoalsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly goals: GoalsRepository,
    private readonly profile: ProfileService,
  ) {}

  list(userId: string, archived: boolean): Promise<Goal[]> {
    return this.goals.list(this.db.pool, userId, archived);
  }

  /**
   * The goal comes after the reflection: 409, with the screens still
   * missing, until onboarding is complete. A goal written after the person
   * has looked at what they can do, what they avoid and what matters is
   * more specific and more their own. The order is a product rule, so it
   * is enforced here and not left to the wizard.
   */
  async create(userId: string, input: CreateGoalDto): Promise<Goal> {
    await this.profile.requireOnboarded(userId);
    return this.goals.create(this.db.pool, userId, input);
  }

  update(userId: string, goalId: string, input: UpdateGoalDto): Promise<Goal> {
    return found(this.goals.update(this.db.pool, userId, goalId, input));
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
        throw new ApiError('goal.has_work_history');
      }
      throw error;
    }
    if (!deleted) {
      throw new ApiError('goal.not_found');
    }
  }
}

/**
 * Turns "no row" into 404. The goal does not exist, or it belongs to
 * someone else; the answer is the same on purpose.
 */
async function found(lookup: Promise<Goal | undefined>): Promise<Goal> {
  const goal = await lookup;
  if (goal === undefined) {
    throw new ApiError('goal.not_found');
  }
  return goal;
}
