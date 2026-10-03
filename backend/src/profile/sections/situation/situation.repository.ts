import { Injectable } from '@nestjs/common';
import { Executor } from '../../../database/database.service.js';
import { onlyRow } from '../../../database/only-row.js';
import { Situation } from './situation.dto.js';
import { UpsertSituationDto } from './upsert-situation.dto.js';

/** One row of `profile_situation`, as PostgreSQL returns it. */
interface SituationRow {
  typical_day: string;
  want_to_change: string;
  satisfied_with: string | null;
  wish_more_time_for: string | null;
  updated_at: Date;
}

const COLUMNS =
  'typical_day, want_to_change, satisfied_with, wish_more_time_for, updated_at';

@Injectable()
export class SituationRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<Situation | undefined> {
    const { rows } = await executor.query<SituationRow>(
      `SELECT ${COLUMNS} FROM profile_situation WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toSituation(row);
  }

  /** Creates the screen the first time and replaces it after that. */
  async upsert(
    executor: Executor,
    userId: string,
    input: UpsertSituationDto,
  ): Promise<Situation> {
    const { rows } = await executor.query<SituationRow>(
      `INSERT INTO profile_situation (
         user_id, typical_day, want_to_change, satisfied_with, wish_more_time_for
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET typical_day = EXCLUDED.typical_day,
             want_to_change = EXCLUDED.want_to_change,
             satisfied_with = EXCLUDED.satisfied_with,
             wish_more_time_for = EXCLUDED.wish_more_time_for,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.typicalDay,
        input.wantToChange,
        input.satisfiedWith ?? null,
        input.wishMoreTimeFor ?? null,
      ],
    );
    return toSituation(onlyRow(rows, 'INSERT INTO profile_situation'));
  }
}

function toSituation(row: SituationRow): Situation {
  return {
    typicalDay: row.typical_day,
    wantToChange: row.want_to_change,
    satisfiedWith: row.satisfied_with,
    wishMoreTimeFor: row.wish_more_time_for,
    updatedAt: row.updated_at,
  };
}
