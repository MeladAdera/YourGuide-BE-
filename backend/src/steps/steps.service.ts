import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import { isForeignKeyViolation } from '../database/pg-errors.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { requireActive } from '../goals/require-active.js';
import { SESSION_STEP_FK } from '../sessions/session-constraints.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import { CreateStepDto } from './dto/create-step.dto.js';
import { Step } from './dto/step.dto.js';
import { UpdateStepDto } from './dto/update-step.dto.js';
import { StepsRepository } from './steps.repository.js';

/**
 * The same shape as TasksService. Reading is always allowed. The three
 * methods that write run in one transaction that locks the goal, asks the
 * two questions in `requireActive` (yours? active?), then writes: an
 * archived goal is read-only all the way down.
 *
 * Nothing here touches the task's status. It is read from the steps, so
 * marking a step done is all it takes to move it.
 */
@Injectable()
export class StepsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly steps: StepsRepository,
    private readonly tasks: TasksRepository,
    private readonly goals: GoalsRepository,
  ) {}

  /**
   * The steps of one task. The task is read first, so that "not your task"
   * is 404 and not an empty list, which would look like a task with no
   * steps.
   */
  async list(userId: string, taskId: string): Promise<Step[]> {
    const task = await this.tasks.find(this.db.pool, userId, taskId);
    if (task === undefined) {
      throw new ApiError('task.not_found');
    }
    return this.steps.list(this.db.pool, userId, taskId);
  }

  /**
   * Two locks, for two different reasons. The goal's keeps it from being
   * archived while the step is added. The task's makes two adds to the
   * same task wait for each other, so each gets its own position.
   *
   * The task lock comes back false when the task was deleted after the
   * goal was read: still 404.
   */
  create(userId: string, taskId: string, input: CreateStepDto): Promise<Step> {
    return this.db.withTransaction(async (client) => {
      const goal = await this.goals.findLockedOfTask(client, userId, taskId);
      requireActive(goal, 'task.not_found');
      if (!(await this.tasks.lock(client, userId, taskId))) {
        throw new ApiError('task.not_found');
      }
      return this.steps.create(client, userId, taskId, input);
    });
  }

  update(userId: string, stepId: string, input: UpdateStepDto): Promise<Step> {
    return this.db.withTransaction(async (client) => {
      const goal = await this.goals.findLockedOfStep(client, userId, stepId);
      requireActive(goal, 'step.not_found');
      return found(await this.steps.update(client, userId, stepId, input));
    });
  }

  /**
   * A step with no work history is deleted. A step with a focus session is
   * not: the database refuses, and the answer is 409. There is no "does it
   * have sessions?" check before the delete: a check has a gap, the
   * foreign key has none.
   */
  async delete(userId: string, stepId: string): Promise<void> {
    try {
      await this.db.withTransaction(async (client) => {
        const goal = await this.goals.findLockedOfStep(client, userId, stepId);
        requireActive(goal, 'step.not_found');
        found(await this.steps.delete(client, userId, stepId));
      });
    } catch (error) {
      if (isForeignKeyViolation(error, SESSION_STEP_FK)) {
        throw new ApiError('step.has_work_history');
      }
      throw error;
    }
  }
}

/**
 * The goal is locked, not the step: another request of the same user can
 * still delete the step between the check and the write. Then the write
 * matches no row, and the answer is 404 like any step that is not there.
 */
function found<T>(result: T | undefined | false): T {
  if (result === undefined || result === false) {
    throw new ApiError('step.not_found');
  }
  return result;
}
