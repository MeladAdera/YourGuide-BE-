import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { Progress } from './dto/progress.dto.js';
import { DEFAULT_PROGRESS_DAYS, ProgressQuery } from './dto/progress.query.js';
import { ProgressRepository } from './progress.repository.js';

/**
 * The proof that the app exists to give: what happened, per day. Nothing
 * is stored for it; the sessions, steps and struggles already say it all,
 * and one statement adds them up.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly db: DatabaseService,
    private readonly progress: ProgressRepository,
  ) {}

  /** The totals are the days added up: one source of truth, the days. */
  async lastDays(userId: string, query: ProgressQuery): Promise<Progress> {
    const days = await this.progress.lastDays(
      this.db.pool,
      userId,
      Number(query.days ?? DEFAULT_PROGRESS_DAYS),
    );
    return {
      days,
      totals: {
        focusMinutes: sum(days.map((day) => day.focusMinutes)),
        stepsDone: sum(days.map((day) => day.stepsDone)),
        struggledAndContinued: sum(
          days.map((day) => day.struggledAndContinued),
        ),
      },
    };
  }
}

function sum(numbers: number[]): number {
  return numbers.reduce((total, number) => total + number, 0);
}
