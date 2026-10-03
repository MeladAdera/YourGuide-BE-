import { Injectable } from '@nestjs/common';
import { Executor } from '../../../database/database.service.js';
import { onlyRow } from '../../../database/only-row.js';
import { Achievements } from './achievements.dto.js';
import { UpsertAchievementsDto } from './upsert-achievements.dto.js';

/** One row of `profile_achievements`, as PostgreSQL returns it. */
interface AchievementsRow {
  proud_of: string;
  what_was_hard: string | null;
  learned_about_self: string | null;
  updated_at: Date;
}

const COLUMNS = 'proud_of, what_was_hard, learned_about_self, updated_at';

@Injectable()
export class AchievementsRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<Achievements | undefined> {
    const { rows } = await executor.query<AchievementsRow>(
      `SELECT ${COLUMNS} FROM profile_achievements WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toAchievements(row);
  }

  /** Creates the screen the first time and replaces it after that. */
  async upsert(
    executor: Executor,
    userId: string,
    input: UpsertAchievementsDto,
  ): Promise<Achievements> {
    const { rows } = await executor.query<AchievementsRow>(
      `INSERT INTO profile_achievements (
         user_id, proud_of, what_was_hard, learned_about_self
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET proud_of = EXCLUDED.proud_of,
             what_was_hard = EXCLUDED.what_was_hard,
             learned_about_self = EXCLUDED.learned_about_self,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.proudOf,
        input.whatWasHard ?? null,
        input.learnedAboutSelf ?? null,
      ],
    );
    return toAchievements(onlyRow(rows, 'INSERT INTO profile_achievements'));
  }
}

function toAchievements(row: AchievementsRow): Achievements {
  return {
    proudOf: row.proud_of,
    whatWasHard: row.what_was_hard,
    learnedAboutSelf: row.learned_about_self,
    updatedAt: row.updated_at,
  };
}
