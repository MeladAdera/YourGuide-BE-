import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { User } from './dto/user.dto.js';

@Injectable()
export class UsersRepository {
  async create(
    executor: Executor,
    input: { email: string; passwordHash: string; timezone: string },
  ): Promise<User> {
    const { rows } = await executor.query<User>(
      `INSERT INTO users (email, password_hash, timezone)
       VALUES ($1, $2, $3)
       RETURNING id, email, timezone`,
      [input.email, input.passwordHash, input.timezone],
    );
    const user = rows[0];
    if (user === undefined) {
      throw new Error('INSERT INTO users returned no row');
    }
    return user;
  }

  async findById(executor: Executor, id: string): Promise<User | undefined> {
    const { rows } = await executor.query<User>(
      `SELECT id, email, timezone FROM users WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  /**
   * Used by login only. The hash is returned next to the user, not inside it,
   * so a `User` sent to the browser can never contain it.
   */
  async findByEmailWithPasswordHash(
    executor: Executor,
    email: string,
  ): Promise<{ user: User; passwordHash: string } | undefined> {
    // lower(email) matches the unique index, so letter case does not matter.
    const { rows } = await executor.query<User & { password_hash: string }>(
      `SELECT id, email, timezone, password_hash
         FROM users
        WHERE lower(email) = lower($1)`,
      [email],
    );
    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }
    return {
      user: { id: row.id, email: row.email, timezone: row.timezone },
      passwordHash: row.password_hash,
    };
  }
}
