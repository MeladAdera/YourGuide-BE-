import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { User } from './dto/user.dto.js';
import type { Locale } from './locale.js';

@Injectable()
export class UsersRepository {
  async create(
    executor: Executor,
    input: {
      email: string;
      passwordHash: string;
      timezone: string;
      locale: Locale;
    },
  ): Promise<User> {
    const { rows } = await executor.query<User>(
      `INSERT INTO users (email, password_hash, timezone, locale)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, timezone, locale`,
      [input.email, input.passwordHash, input.timezone, input.locale],
    );
    const user = rows[0];
    if (user === undefined) {
      throw new Error('INSERT INTO users returned no row');
    }
    return user;
  }

  async findById(executor: Executor, id: string): Promise<User | undefined> {
    const { rows } = await executor.query<User>(
      `SELECT id, email, timezone, locale FROM users WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  /**
   * Changes only what is given: a value left out arrives as NULL, and
   * COALESCE keeps the old one. Nothing here can be cleared, so NULL is
   * free to mean "not sent".
   */
  async update(
    executor: Executor,
    id: string,
    input: { locale?: Locale },
  ): Promise<User | undefined> {
    const { rows } = await executor.query<User>(
      `UPDATE users
          SET locale = COALESCE($2::text, locale)
        WHERE id = $1
        RETURNING id, email, timezone, locale`,
      [id, input.locale ?? null],
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
      `SELECT id, email, timezone, locale, password_hash
         FROM users
        WHERE lower(email) = lower($1)`,
      [email],
    );
    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }
    return {
      user: {
        id: row.id,
        email: row.email,
        timezone: row.timezone,
        locale: row.locale,
      },
      passwordHash: row.password_hash,
    };
  }
}
