import { Injectable } from '@nestjs/common';
import { Executor } from '../../../database/database.service.js';
import { onlyRow } from '../../../database/only-row.js';
import { UpsertValuesDto } from './upsert-values.dto.js';

/** The free-text half of screen 7, as the service assembles it. */
export interface Meaning {
  personToBecome: string;
  wouldRegretNotDoing: string | null;
  rememberedFor: string | null;
  updatedAt: Date;
}

/** One row of `profile_meaning`, as PostgreSQL returns it. */
interface MeaningRow {
  person_to_become: string;
  would_regret_not_doing: string | null;
  remembered_for: string | null;
  updated_at: Date;
}

const COLUMNS =
  'person_to_become, would_regret_not_doing, remembered_for, updated_at';

/**
 * The free text of screen 7. Its row is what makes the screen "saved";
 * the picks live in ValuesRepository and are written in the same
 * transaction.
 */
@Injectable()
export class MeaningRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<Meaning | undefined> {
    const { rows } = await executor.query<MeaningRow>(
      `SELECT ${COLUMNS} FROM profile_meaning WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toMeaning(row);
  }

  /** Creates the row the first time and replaces it after that. */
  async upsert(
    executor: Executor,
    userId: string,
    input: Pick<
      UpsertValuesDto,
      'personToBecome' | 'wouldRegretNotDoing' | 'rememberedFor'
    >,
  ): Promise<Meaning> {
    const { rows } = await executor.query<MeaningRow>(
      `INSERT INTO profile_meaning (
         user_id, person_to_become, would_regret_not_doing, remembered_for
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET person_to_become = EXCLUDED.person_to_become,
             would_regret_not_doing = EXCLUDED.would_regret_not_doing,
             remembered_for = EXCLUDED.remembered_for,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.personToBecome,
        input.wouldRegretNotDoing ?? null,
        input.rememberedFor ?? null,
      ],
    );
    return toMeaning(onlyRow(rows, 'INSERT INTO profile_meaning'));
  }
}

function toMeaning(row: MeaningRow): Meaning {
  return {
    personToBecome: row.person_to_become,
    wouldRegretNotDoing: row.would_regret_not_doing,
    rememberedFor: row.remembered_for,
    updatedAt: row.updated_at,
  };
}
