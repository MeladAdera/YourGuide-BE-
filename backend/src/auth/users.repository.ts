import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';

/** A user as the API returns it. Never includes the password hash. */
export interface User {
  id: string;
  email: string;
  timezone: string;
}

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
}
