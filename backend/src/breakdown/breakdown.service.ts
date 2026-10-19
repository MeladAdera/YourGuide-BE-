import { Injectable } from '@nestjs/common';
import { AiUsageService } from '../ai/ai-usage.service.js';
import { AiService } from '../ai/ai.service.js';
import { UsersRepository } from '../auth/users.repository.js';
import { ApiError } from '../common/api-error.js';
import { DatabaseService } from '../database/database.service.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { StepsRepository } from '../steps/steps.repository.js';
import { TasksRepository } from '../tasks/tasks.repository.js';
import { buildBreakdownPrompt } from './breakdown-prompt.js';
import { parseBreakdown } from './breakdown-reply.js';
import { Breakdown } from './dto/breakdown.dto.js';

/**
 * Cutting a task into small steps is where people stall before any session
 * starts. The model suggests the steps; the person accepts or edits them on
 * the screen, which creates them with the normal route. Nothing is saved
 * here but the call itself, for the daily limit.
 */
@Injectable()
export class BreakdownService {
  constructor(
    private readonly db: DatabaseService,
    private readonly ai: AiService,
    private readonly usage: AiUsageService,
    private readonly users: UsersRepository,
    private readonly goals: GoalsRepository,
    private readonly tasks: TasksRepository,
    private readonly steps: StepsRepository,
  ) {}

  /**
   * In this order: is the task yours (404)? Is its goal active (409: an
   * archived goal is read-only, and steps could not be added anyway)? Is
   * today's limit reached (429, nothing sent)? Then the goal, the task and
   * its steps go to the model, and the answer is checked step by step.
   *
   * No transaction and no lock: nothing is written under the goal. The
   * call is counted once the model has answered.
   */
  async suggest(userId: string, taskId: string): Promise<Breakdown> {
    const pool = this.db.pool;
    const task = await this.tasks.find(pool, userId, taskId);
    if (task === undefined) {
      throw new ApiError('task.not_found');
    }
    const goal = await this.goals.find(pool, userId, task.goalId);
    if (goal === undefined) {
      throw new ApiError('task.not_found');
    }
    if (goal.archivedAt !== null) {
      throw new ApiError('goal.archived');
    }
    await this.usage.assertBelowLimit(userId);

    const [user, steps] = await Promise.all([
      this.users.findById(pool, userId),
      this.steps.list(pool, userId, taskId),
    ]);
    if (user === undefined) {
      throw new ApiError('auth.not_logged_in');
    }
    const titles = await this.ai.ask(
      buildBreakdownPrompt({ locale: user.locale, goal, task, steps }),
      parseBreakdown,
    );
    await this.usage.record(userId, 'breakdown', () => Promise.resolve());
    return { steps: titles };
  }
}
