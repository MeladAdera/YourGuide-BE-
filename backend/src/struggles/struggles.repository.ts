import { Injectable } from '@nestjs/common';
import { Executor } from '../database/database.service.js';
import { Struggle } from './dto/struggle.dto.js';
import type { PastStruggle } from './prompt/build-prompt.js';
import type { Situation } from './situation.js';

interface StruggleRow {
  id: string;
  situation: Situation;
  description: string;
  advice: string;
  next_step: string;
  continued: boolean | null;
  session_id: string | null;
  created_at: Date;
}

const COLUMNS =
  'id, situation, description, advice, next_step, continued, session_id, created_at';

@Injectable()
export class StrugglesRepository {
  /** The last struggles, newest first, for the prompt. */
  async listRecent(
    executor: Executor,
    userId: string,
    limit: number,
  ): Promise<PastStruggle[]> {
    const { rows } = await executor.query<StruggleRow>(
      `SELECT ${COLUMNS} FROM struggles
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => ({
      situation: row.situation,
      description: row.description,
      advice: row.advice,
      nextStep: row.next_step,
      continued: row.continued,
      createdAt: row.created_at,
    }));
  }

  async create(
    executor: Executor,
    userId: string,
    input: {
      situation: Situation;
      description: string;
      advice: string;
      nextStep: string;
      sessionId: string | null;
    },
  ): Promise<Struggle> {
    const { rows } = await executor.query<StruggleRow>(
      `INSERT INTO struggles
         (user_id, session_id, situation, description, advice, next_step)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.sessionId,
        input.situation,
        input.description,
        input.advice,
        input.nextStep,
      ],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new Error('INSERT INTO struggles returned no row');
    }
    return toStruggle(row);
  }

  /**
   * Writes the answer to "did you continue?" where none has been written.
   * Undefined when no unanswered struggle with this id belongs to the user:
   * it does not exist, it is someone else's, or it was answered already.
   * "Is it still unanswered?" is part of the UPDATE itself, so a double
   * click writes once.
   */
  async answer(
    executor: Executor,
    userId: string,
    struggleId: string,
    continued: boolean,
  ): Promise<Struggle | undefined> {
    const { rows } = await executor.query<StruggleRow>(
      `UPDATE struggles SET continued = $3
        WHERE id = $2 AND user_id = $1 AND continued IS NULL
        RETURNING ${COLUMNS}`,
      [userId, struggleId, continued],
    );
    const row = rows[0];
    return row === undefined ? undefined : toStruggle(row);
  }

  /** Whether the user has a struggle with this id, answered or not. */
  async exists(
    executor: Executor,
    userId: string,
    struggleId: string,
  ): Promise<boolean> {
    const { rowCount } = await executor.query(
      'SELECT 1 FROM struggles WHERE id = $2 AND user_id = $1',
      [userId, struggleId],
    );
    return (rowCount ?? 0) > 0;
  }
}

function toStruggle(row: StruggleRow): Struggle {
  return {
    id: row.id,
    situation: row.situation,
    description: row.description,
    advice: row.advice,
    nextStep: row.next_step,
    continued: row.continued,
    sessionId: row.session_id,
    createdAt: row.created_at,
  };
}
