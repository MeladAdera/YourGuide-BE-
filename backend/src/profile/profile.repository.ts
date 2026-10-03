import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { onlyRow } from '../database/only-row.js';
import { Direction } from './dto/profile.dto.js';
import { UpsertProfileDto } from './dto/upsert-profile.dto.js';

/** One row of `profiles`, as PostgreSQL returns it. */
interface ProfileRow {
  goal: string;
  why_it_matters: string;
  usual_blocker: string;
  first_outcome: string | null;
  completed_at: Date;
  updated_at: Date;
}

const COLUMNS =
  'goal, why_it_matters, usual_blocker, first_outcome, completed_at, updated_at';

/** The direction, screen 8. Its row is what makes onboarding complete. */
@Injectable()
export class ProfileRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<Direction | undefined> {
    const { rows } = await executor.query<ProfileRow>(
      `SELECT ${COLUMNS} FROM profiles WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toDirection(row);
  }

  /**
   * Creates the profile the first time and replaces it after that, in one
   * statement. `user_id` is the primary key, so the conflict can only be
   * "this user already has a profile". `completed_at` is not in the
   * UPDATE list on purpose: it keeps its first value.
   */
  async upsert(
    executor: Executor,
    userId: string,
    input: UpsertProfileDto,
  ): Promise<Direction> {
    const { rows } = await executor.query<ProfileRow>(
      `INSERT INTO profiles (
         user_id, goal, why_it_matters, usual_blocker, first_outcome
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE
         SET goal = EXCLUDED.goal,
             why_it_matters = EXCLUDED.why_it_matters,
             usual_blocker = EXCLUDED.usual_blocker,
             first_outcome = EXCLUDED.first_outcome,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.goal,
        input.whyItMatters,
        input.usualBlocker,
        input.firstOutcome ?? null,
      ],
    );
    return toDirection(onlyRow(rows, 'INSERT INTO profiles'));
  }
}

function toDirection(row: ProfileRow): Direction {
  return {
    goal: row.goal,
    whyItMatters: row.why_it_matters,
    usualBlocker: row.usual_blocker,
    firstOutcome: row.first_outcome,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}
