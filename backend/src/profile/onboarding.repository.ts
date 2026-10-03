import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { onlyRow } from '../database/only-row.js';
import type { Screen } from './screens.js';

/** Which screens have a row, and whether the direction (screen 8) has one. */
export type SavedScreens = Record<Screen, boolean> & { direction: boolean };

/**
 * One query answers "where is this person in onboarding?". A screen is
 * saved when its row exists; there is no status column to keep in sync.
 */
@Injectable()
export class OnboardingRepository {
  async savedScreens(
    executor: Executor,
    userId: string,
  ): Promise<SavedScreens> {
    const { rows } = await executor.query<SavedScreens>(
      `SELECT
         EXISTS (SELECT 1 FROM profile_basics       WHERE user_id = $1) AS basics,
         EXISTS (SELECT 1 FROM profile_situation    WHERE user_id = $1) AS situation,
         EXISTS (SELECT 1 FROM profile_achievements WHERE user_id = $1) AS achievements,
         EXISTS (SELECT 1 FROM profile_patterns     WHERE user_id = $1) AS patterns,
         EXISTS (SELECT 1 FROM profile_self_view    WHERE user_id = $1) AS "selfView",
         EXISTS (SELECT 1 FROM profile_confidence   WHERE user_id = $1) AS confidence,
         EXISTS (SELECT 1 FROM profile_meaning      WHERE user_id = $1) AS values,
         EXISTS (SELECT 1 FROM profiles             WHERE user_id = $1) AS direction`,
      [userId],
    );
    return onlyRow(rows, 'SELECT saved screens');
  }
}
