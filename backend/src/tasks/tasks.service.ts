import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import { isForeignKeyViolation } from '../database/pg-errors.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { requireActive } from '../goals/require-active.js';
import { SESSION_STEP_FK } from '../sessions/session-constraints.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { Task } from './dto/task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksRepository } from './tasks.repository.js';

/**
 * An archived goal is read-only: its tasks can be listed, and nothing under
 * it can be added, renamed or deleted until it is unarchived. So the three
 * methods that write have the same shape: one transaction that locks the
 * goal, asks the two questions in `requireActive`, then writes.
 *
 * The lock is what makes the questions worth asking. Without it the goal
 * could be archived or deleted between the check and the write.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tasks: TasksRepository,
    private readonly goals: GoalsRepository,
  ) {}

  /**
   * The tasks of one goal. The goal is read first, so that "not your goal"
   * is 404 and not an empty list, which would look like a goal with no
   * tasks. An archived goal lists its tasks too: reading is always allowed.
   */
  async list(userId: string, goalId: string): Promise<Task[]> {
    const goal = await this.goals.find(this.db.pool, userId, goalId);
    if (goal === undefined) {
      throw new ApiError('goal.not_found');
    }
    return this.tasks.list(this.db.pool, userId, goalId);
  }

  /**
   * `tasks.goal_id` is a foreign key to the goal alone, so the database
   * cannot say whose goal it is. The check here is the only thing that
   * stops a task being put under another user's goal.
   */
  create(userId: string, goalId: string, input: CreateTaskDto): Promise<Task> {
    return this.db.withTransaction(async (client) => {
      const goal = await this.goals.findLocked(client, userId, goalId);
      requireActive(goal, 'goal.not_found');
      return this.tasks.create(client, userId, goalId, input);
    });
  }

  update(userId: string, taskId: string, input: UpdateTaskDto): Promise<Task> {
    return this.db.withTransaction(async (client) => {
      const goal = await this.goals.findLockedOfTask(client, userId, taskId);
      requireActive(goal, 'task.not_found');
      return found(await this.tasks.update(client, userId, taskId, input));
    });
  }

  /**
   * A task with no work history is deleted, with its steps. A task with
   * history is not: the database refuses, as it does for a goal, and the
   * answer is 409. There is no "does it have sessions?" check before the
   * delete: a check has a gap, the foreign key has none.
   */
  async delete(userId: string, taskId: string): Promise<void> {
    try {
      await this.db.withTransaction(async (client) => {
        const goal = await this.goals.findLockedOfTask(client, userId, taskId);
        requireActive(goal, 'task.not_found');
        found(await this.tasks.delete(client, userId, taskId));
      });
    } catch (error) {
      if (isForeignKeyViolation(error, SESSION_STEP_FK)) {
        throw new ApiError('task.has_work_history');
      }
      throw error;
    }
  }
}

/**
 * The goal is locked, not the task: another request of the same user can
 * still delete the task between the check and the write. Then the write
 * matches no row, and the answer is 404 like any task that is not there.
 */
function found<T>(result: T | undefined | false): T {
  if (result === undefined || result === false) {
    throw new ApiError('task.not_found');
  }
  return result;
}
