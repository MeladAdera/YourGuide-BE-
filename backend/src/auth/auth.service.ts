import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { hash, verify } from 'argon2';
import { DatabaseService, Executor } from '../database/database.service.js';
import { isUniqueViolation } from '../database/pg-errors.js';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { User, UsersRepository } from './users.repository.js';

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
      // One message for both cases, for the same reason.
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Every login gets a new token. An old one is never reused.
    const session = await this.createSession(this.db.pool, found.user.id);
    return { user: found.user, session };
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

/** Only this hash is stored, so a leaked database cannot be used to log in. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
