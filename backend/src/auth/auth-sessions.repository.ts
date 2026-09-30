import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';

@Injectable()
export class AuthSessionsRepository {
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
}
