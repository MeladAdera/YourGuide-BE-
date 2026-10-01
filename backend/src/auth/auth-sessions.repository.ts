import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';

@Injectable()
export class AuthSessionsRepository {
  /**
   * The owner of a live session. Undefined when the token is unknown or the
   * session has expired: the guard treats both the same way.
   */
  async findUserIdByTokenHash(
    executor: Executor,
    tokenHash: string,
  ): Promise<string | undefined> {
    const { rows } = await executor.query<{ user_id: string }>(
      `SELECT user_id
         FROM auth_sessions
        WHERE token_hash = $1 AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0]?.user_id;
  }

  async create(
    executor: Executor,
    input: { tokenHash: string; userId: string; expiresAt: Date },
  ): Promise<void> {
    await executor.query(
      `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [input.tokenHash, input.userId, input.expiresAt],
    );
  }

  /** Cleanup at login: only this user's rows, and only the expired ones. */
  async deleteExpiredForUser(
    executor: Executor,
    userId: string,
  ): Promise<void> {
    await executor.query(
      `DELETE FROM auth_sessions WHERE user_id = $1 AND expires_at <= now()`,
      [userId],
    );
  }

  async deleteByTokenHash(
    executor: Executor,
    tokenHash: string,
  ): Promise<void> {
    await executor.query(`DELETE FROM auth_sessions WHERE token_hash = $1`, [
      tokenHash,
    ]);
  }
}
