import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';

/** What a model call was for. Must match the CHECK constraint of `ai_calls`. */
export const AI_CALL_KINDS = ['struggle', 'breakdown'] as const;
export type AiCallKind = (typeof AI_CALL_KINDS)[number];

/** The `ai_calls` table: one row per call that answered (migration 0012). */
@Injectable()
export class AiUsageRepository {
  /**
   * How many calls the user has made today, in the user's own day: the
   * same "today" the progress page uses, so the limit and the chart agree.
   * The `(user_id, created_at)` index does the work.
   */
  async countToday(executor: Executor, userId: string): Promise<number> {
    const { rows } = await executor.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM ai_calls
         JOIN users ON users.id = ai_calls.user_id
        WHERE ai_calls.user_id = $1
          AND ai_calls.created_at >= (
                (now() AT TIME ZONE users.timezone)::date::timestamp
                AT TIME ZONE users.timezone
              )`,
      [userId],
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Holds the user's own row until the transaction ends. Two requests at
   * the limit then write one after the other, and the second one's count
   * sees the first one's row. Nothing else locks `users`.
   */
  async lockUser(executor: Executor, userId: string): Promise<void> {
    await executor.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [
      userId,
    ]);
  }

  async record(
    executor: Executor,
    userId: string,
    kind: AiCallKind,
  ): Promise<void> {
    await executor.query(
      'INSERT INTO ai_calls (user_id, kind) VALUES ($1, $2)',
      [userId, kind],
    );
  }
}
