import { DatabaseError } from 'pg';

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** True when `error` is PostgreSQL refusing a duplicate for this index. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === UNIQUE_VIOLATION &&
    error.constraint === constraint
  );
}

/**
 * True when `error` is PostgreSQL refusing a delete (or update) because
 * rows still point at the row through this foreign key.
 */
export function isForeignKeyViolation(
  error: unknown,
  constraint: string,
): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === FOREIGN_KEY_VIOLATION &&
    error.constraint === constraint
  );
}
