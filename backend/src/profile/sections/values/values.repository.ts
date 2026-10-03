import { Injectable } from '@nestjs/common';
import { Executor } from '../../../database/database.service.js';
import type { LifeValue } from './life-values.js';
import { ValuePickDto } from './upsert-values.dto.js';
import { ValuePick } from './values.dto.js';

/** One row of `profile_values`, as PostgreSQL returns it. */
interface ValueRow {
  value: LifeValue;
  note: string | null;
}

/**
 * The picks of screen 7: many rows per user. Always read and written as a
 * whole set, in alphabetical order. The caller runs `replace` inside the
 * transaction that also saves the free text.
 */
@Injectable()
export class ValuesRepository {
  async findByUserId(executor: Executor, userId: string): Promise<ValuePick[]> {
    const { rows } = await executor.query<ValueRow>(
      `SELECT value, note FROM profile_values
        WHERE user_id = $1
        ORDER BY value`,
      [userId],
    );
    return rows.map(toValuePick);
  }

  /**
   * Replaces the user's whole set: delete every pick, insert the new ones.
   * Two statements, so this must run inside a transaction; otherwise a
   * failed insert would leave the user with no picks at all.
   *
   * `unnest` turns the two arrays (values, notes) into rows, so any number
   * of picks is one INSERT with three parameters.
   */
  async replace(
    executor: Executor,
    userId: string,
    picks: ValuePickDto[],
  ): Promise<void> {
    await executor.query('DELETE FROM profile_values WHERE user_id = $1', [
      userId,
    ]);
    await executor.query(
      `INSERT INTO profile_values (user_id, value, note)
       SELECT $1, value, note
         FROM unnest($2::text[], $3::text[]) AS picks(value, note)`,
      [
        userId,
        picks.map((pick) => pick.value),
        picks.map((pick) => pick.note ?? null),
      ],
    );
  }
}

function toValuePick(row: ValueRow): ValuePick {
  return { value: row.value, note: row.note };
}
