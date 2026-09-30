import { DatabaseError } from 'pg';

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';

/** True when `error` is PostgreSQL refusing a duplicate for this index. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === UNIQUE_VIOLATION &&
    error.constraint === constraint
  );
}
