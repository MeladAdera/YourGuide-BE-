import { Injectable } from '@nestjs/common';
import { Executor } from '../../../database/database.service.js';
import { onlyRow } from '../../../database/only-row.js';
import { Patterns } from './patterns.dto.js';
import { UpsertPatternsDto } from './upsert-patterns.dto.js';

/** One row of `profile_patterns`, as PostgreSQL returns it. */
interface PatternsRow {
  often_postpone: string;
  lesson_from_mistake: string | null;
  pattern_to_change: string | null;
  updated_at: Date;
}

const COLUMNS =
  'often_postpone, lesson_from_mistake, pattern_to_change, updated_at';

@Injectable()
export class PatternsRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<Patterns | undefined> {
    const { rows } = await executor.query<PatternsRow>(
      `SELECT ${COLUMNS} FROM profile_patterns WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toPatterns(row);
  }

  /** Creates the screen the first time and replaces it after that. */
  async upsert(
    executor: Executor,
    userId: string,
    input: UpsertPatternsDto,
  ): Promise<Patterns> {
    const { rows } = await executor.query<PatternsRow>(
      `INSERT INTO profile_patterns (
         user_id, often_postpone, lesson_from_mistake, pattern_to_change
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
         SET often_postpone = EXCLUDED.often_postpone,
             lesson_from_mistake = EXCLUDED.lesson_from_mistake,
             pattern_to_change = EXCLUDED.pattern_to_change,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.oftenPostpone,
        input.lessonFromMistake ?? null,
        input.patternToChange ?? null,
      ],
    );
    return toPatterns(onlyRow(rows, 'INSERT INTO profile_patterns'));
  }
}

function toPatterns(row: PatternsRow): Patterns {
  return {
    oftenPostpone: row.often_postpone,
    lessonFromMistake: row.lesson_from_mistake,
    patternToChange: row.pattern_to_change,
    updatedAt: row.updated_at,
  };
}
