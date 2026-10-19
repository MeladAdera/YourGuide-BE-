import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ApiError } from '../common/api-error.js';
import { AppConfig } from '../config/app-config.js';
import { DatabaseService } from '../database/database.service.js';
import { AiCallKind, AiUsageRepository } from './ai-usage.repository.js';

/**
 * The daily limit per user (`AI_DAILY_LIMIT`), for every kind of model
 * call. The provider's quota belongs to one key for the whole app; this is
 * the brake we control. Two checks, on purpose:
 *
 * - `assertBelowLimit` before the model is asked, so nothing is sent past
 *   the limit.
 * - `record` once the model has answered: in one transaction, the user's
 *   own row is locked, the count is taken again, the call is written, and
 *   whatever the answer is saved with is written too. Two requests at the
 *   limit can both pass the first check; the lock makes them write one
 *   after the other, and the second one's count sees the first one's row.
 *   That rare race costs one model call and never writes past the limit.
 *
 * A failed call is not counted: the person may try again.
 */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AppConfig,
    private readonly calls: AiUsageRepository,
  ) {}

  async assertBelowLimit(userId: string): Promise<void> {
    if (
      (await this.calls.countToday(this.db.pool, userId)) >=
      this.config.aiDailyLimit
    ) {
      throw new ApiError('ai.daily_limit');
    }
  }

  async record<T>(
    userId: string,
    kind: AiCallKind,
    write: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.db.withTransaction(async (client) => {
      await this.calls.lockUser(client, userId);
      if (
        (await this.calls.countToday(client, userId)) >=
        this.config.aiDailyLimit
      ) {
        throw new ApiError('ai.daily_limit');
      }
      await this.calls.record(client, userId, kind);
      return write(client);
    });
  }
}
