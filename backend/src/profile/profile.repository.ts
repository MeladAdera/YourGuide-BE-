import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { Profile } from './dto/profile.dto.js';
import { UpsertProfileDto } from './dto/upsert-profile.dto.js';

/** One row of `profiles`, as PostgreSQL returns it. */
interface ProfileRow {
  goal: string;
  why_it_matters: string;
  usual_blocker: string;
  updated_at: Date;
}

const COLUMNS = 'goal, why_it_matters, usual_blocker, updated_at';

@Injectable()
export class ProfileRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<Profile | undefined> {
    const { rows } = await executor.query<ProfileRow>(
      `SELECT ${COLUMNS} FROM profiles WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toProfile(row);
  }

  /**
   * Creates the profile the first time and replaces it after that, in one
   * statement. `user_id` is the primary key, so the conflict can only be
   * "this user already has a profile".
   */
  async upsert(
    executor: Executor,
    userId: string,
    input: UpsertProfileDto,
  ): Promise<Profile> {
    const { rows } = await executor.query<ProfileRow>(
      `INSERT INTO profiles (user_id, goal, why_it_matters, usual_blocker)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET goal = EXCLUDED.goal,
             why_it_matters = EXCLUDED.why_it_matters,
             usual_blocker = EXCLUDED.usual_blocker,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [userId, input.goal, input.whyItMatters, input.usualBlocker],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new Error('INSERT INTO profiles returned no row');
    }
    return toProfile(row);
  }
}

function toProfile(row: ProfileRow): Profile {
  return {
    goal: row.goal,
    whyItMatters: row.why_it_matters,
    usualBlocker: row.usual_blocker,
    updatedAt: row.updated_at,
  };
}
