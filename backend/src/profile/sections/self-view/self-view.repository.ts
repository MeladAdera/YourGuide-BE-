import { Injectable } from '@nestjs/common';
import { Executor } from '../../../database/database.service.js';
import { onlyRow } from '../../../database/only-row.js';
import { SelfView } from './self-view.dto.js';
import { UpsertSelfViewDto } from './upsert-self-view.dto.js';

/** One row of `profile_self_view`, as PostgreSQL returns it. */
interface SelfViewRow {
  who_i_am: string;
  good_at: string | null;
  others_come_to_me_for: string | null;
  still_figuring_out: string | null;
  updated_at: Date;
}

const COLUMNS =
  'who_i_am, good_at, others_come_to_me_for, still_figuring_out, updated_at';

@Injectable()
export class SelfViewRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<SelfView | undefined> {
    const { rows } = await executor.query<SelfViewRow>(
      `SELECT ${COLUMNS} FROM profile_self_view WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toSelfView(row);
  }

  /** Creates the screen the first time and replaces it after that. */
  async upsert(
    executor: Executor,
    userId: string,
    input: UpsertSelfViewDto,
  ): Promise<SelfView> {
    const { rows } = await executor.query<SelfViewRow>(
      `INSERT INTO profile_self_view (
         user_id, who_i_am, good_at, others_come_to_me_for, still_figuring_out
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET who_i_am = EXCLUDED.who_i_am,
             good_at = EXCLUDED.good_at,
             others_come_to_me_for = EXCLUDED.others_come_to_me_for,
             still_figuring_out = EXCLUDED.still_figuring_out,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.whoIAm,
        input.goodAt ?? null,
        input.othersComeToMeFor ?? null,
        input.stillFiguringOut ?? null,
      ],
    );
    return toSelfView(onlyRow(rows, 'INSERT INTO profile_self_view'));
  }
}

function toSelfView(row: SelfViewRow): SelfView {
  return {
    whoIAm: row.who_i_am,
    goodAt: row.good_at,
    othersComeToMeFor: row.others_come_to_me_for,
    stillFiguringOut: row.still_figuring_out,
    updatedAt: row.updated_at,
  };
}
