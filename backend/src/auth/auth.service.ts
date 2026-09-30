import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import { DatabaseService, Executor } from '../database/database.service.js';
import { isUniqueViolation } from '../database/pg-errors.js';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import { RegisterDto } from './dto/register.dto.js';
import { User, UsersRepository } from './users.repository.js';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** What the browser needs to stay logged in. The token is never stored. */
export interface NewSession {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersRepository,
    private readonly authSessions: AuthSessionsRepository,
  ) {}

  async register(
    input: RegisterDto,
  ): Promise<{ user: User; session: NewSession }> {
    // Hashing is slow on purpose, so it happens before the transaction:
    // no database connection is held while it runs.
    const passwordHash = await hash(input.password);

    try {
      // The user and their session are saved together or not at all.
      return await this.db.withTransaction(async (client) => {
        const user = await this.users.create(client, {
          email: input.email,
          passwordHash,
          timezone: input.timezone,
        });
        const session = await this.createSession(client, user.id);
        return { user, session };
      });
    } catch (error) {
      // The database decides whether the email is taken (case-insensitive).
      if (isUniqueViolation(error, 'users_email_unique')) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }
      throw error;
    }
  }

  private async createSession(
    executor: Executor,
    userId: string,
  ): Promise<NewSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    await this.authSessions.create(executor, {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
    });
    return { token, expiresAt };
  }
}

/** Only this hash is stored, so a leaked database cannot be used to log in. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
