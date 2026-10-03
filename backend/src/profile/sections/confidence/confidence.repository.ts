import { Injectable } from '@nestjs/common';
import { Executor } from '../../../database/database.service.js';
import { onlyRow } from '../../../database/only-row.js';
import { Confidence } from './confidence.dto.js';
import { UpsertConfidenceDto } from './upsert-confidence.dto.js';

/** One row of `profile_confidence`, as PostgreSQL returns it. */
interface ConfidenceRow {
  can_learn_if_persist: number;
  can_try_again: number;
  follow_through: number;
  focus_without_motivation: number;
  actions_shape_future: number;
  doubt_despite_evidence: number;
  avoid_when_afraid: number;
  compare_too_much: number;
  updated_at: Date;
}

const COLUMNS = `can_learn_if_persist, can_try_again, follow_through,
  focus_without_motivation, actions_shape_future, doubt_despite_evidence,
  avoid_when_afraid, compare_too_much, updated_at`;

@Injectable()
export class ConfidenceRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<Confidence | undefined> {
    const { rows } = await executor.query<ConfidenceRow>(
      `SELECT ${COLUMNS} FROM profile_confidence WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toConfidence(row);
  }

  /** Creates the screen the first time and replaces it after that. */
  async upsert(
    executor: Executor,
    userId: string,
    input: UpsertConfidenceDto,
  ): Promise<Confidence> {
    const { rows } = await executor.query<ConfidenceRow>(
      `INSERT INTO profile_confidence (
         user_id, can_learn_if_persist, can_try_again, follow_through,
         focus_without_motivation, actions_shape_future,
         doubt_despite_evidence, avoid_when_afraid, compare_too_much
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id) DO UPDATE
         SET can_learn_if_persist = EXCLUDED.can_learn_if_persist,
             can_try_again = EXCLUDED.can_try_again,
             follow_through = EXCLUDED.follow_through,
             focus_without_motivation = EXCLUDED.focus_without_motivation,
             actions_shape_future = EXCLUDED.actions_shape_future,
             doubt_despite_evidence = EXCLUDED.doubt_despite_evidence,
             avoid_when_afraid = EXCLUDED.avoid_when_afraid,
             compare_too_much = EXCLUDED.compare_too_much,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.canLearnIfPersist,
        input.canTryAgain,
        input.followThrough,
        input.focusWithoutMotivation,
        input.actionsShapeFuture,
        input.doubtDespiteEvidence,
        input.avoidWhenAfraid,
        input.compareTooMuch,
      ],
    );
    return toConfidence(onlyRow(rows, 'INSERT INTO profile_confidence'));
  }
}

function toConfidence(row: ConfidenceRow): Confidence {
  return {
    canLearnIfPersist: row.can_learn_if_persist,
    canTryAgain: row.can_try_again,
    followThrough: row.follow_through,
    focusWithoutMotivation: row.focus_without_motivation,
    actionsShapeFuture: row.actions_shape_future,
    doubtDespiteEvidence: row.doubt_despite_evidence,
    avoidWhenAfraid: row.avoid_when_afraid,
    compareTooMuch: row.compare_too_much,
    updatedAt: row.updated_at,
  };
}
