import { createHash, randomBytes } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify } from 'argon2';
import { ApiError } from '../common/api-error.js';
import { DatabaseService, Executor } from '../database/database.service.js';
import { isUniqueViolation } from '../database/pg-errors.js';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { User } from './dto/user.dto.js';
import { UsersRepository } from './users.repository.js';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** What the browser needs to stay logged in. The token is never stored. */
export interface NewSession {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService implements OnModuleInit {
  /** What login checks the password against when the email has no account. */
  private dummyPasswordHash!: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersRepository,
    private readonly authSessions: AuthSessionsRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    // Made with the same settings as a real password hash, so checking it
    // takes the same time. The value is random: no password can match it.
    this.dummyPasswordHash = await hash(randomBytes(32).toString('base64url'));
  }

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
          locale: input.locale,
        });
        const session = await this.createSession(client, user.id);
        return { user, session };
      });
    } catch (error) {
      // The database decides whether the email is taken (case-insensitive).
      if (isUniqueViolation(error, 'users_email_unique')) {
        throw new ApiError('auth.email_taken');
      }
      throw error;
    }
  }

  async login(input: LoginDto): Promise<{ user: User; session: NewSession }> {
    const found = await this.users.findByEmailWithPasswordHash(
      this.db.pool,
      input.email,
    );
    // A hash is checked even when the email has no account. Otherwise
    // "no account" would answer faster than "wrong password", and the
    // response time would reveal which emails are registered.
    const passwordMatches = await verify(
      found?.passwordHash ?? this.dummyPasswordHash,
      input.password,
    );
    if (found === undefined || !passwordMatches) {
      // One answer for both cases, for the same reason.
      throw new ApiError('auth.invalid_credentials');
    }

    // Expired sessions are useless rows. Each user removes their own at
    // login, so the table does not grow forever and no cleanup job is needed.
    // Live sessions (another device) are kept.
    await this.authSessions.deleteExpiredForUser(this.db.pool, found.user.id);

    // Every login gets a new token. An old one is never reused.
    const session = await this.createSession(this.db.pool, found.user.id);
    return { user: found.user, session };
  }

  /** For GET /auth/me. `userId` comes from the guard, so the user exists. */
  async currentUser(userId: string): Promise<User> {
    return existing(userId, await this.users.findById(this.db.pool, userId));
  }

  /** For PATCH /auth/me: the language the app shows this user. */
  async updateMe(userId: string, input: UpdateMeDto): Promise<User> {
    return existing(
      userId,
      await this.users.update(this.db.pool, userId, input),
    );
  }

  /** Deleting the row is what ends the session: the token stops working. */
  async logout(token: string): Promise<void> {
    await this.authSessions.deleteByTokenHash(this.db.pool, hashToken(token));
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

/**
 * ON DELETE CASCADE removes a user's sessions with the user, so a live
 * session without a user means the database is broken. Fail fast.
 */
function existing(userId: string, user: User | undefined): User {
  if (user === undefined) {
    throw new Error(`Session belongs to missing user ${userId}`);
  }
  return user;
}

/** Only this hash is stored, so a leaked database cannot be used to log in. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
