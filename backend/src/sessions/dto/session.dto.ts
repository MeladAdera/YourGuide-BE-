import { ApiProperty } from '@nestjs/swagger';
import { SESSION_OUTCOMES } from '../session-outcome.js';
// `import type`: a decorated class emits type metadata, and this is only a
// type (the array above is the runtime value).
import type { SessionOutcome } from '../session-outcome.js';

/** An id with its title: enough to show a thing by name and to link to it. */
export class Titled {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Understand SELECT' })
  title!: string;
}

/**
 * An active focus session as the API returns it: running, or stopped and
 * awaiting its review. No user_id: it is always your own.
 *
 * It names the step, and the task and the goal above it. After a page
 * reload this answer is all the frontend has to draw the timer screen
 * from, and no route reads one step by its id. The titles are read when
 * the answer is built, so a rename shows the next time it is asked for.
 *
 * No duration: the timer is the time now minus `startedAt`, counted by the
 * client. No outcome, note or rating: an active session has none yet.
 */
export class Session {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      "When the session started, by the server's clock. The timer counts from here.",
  })
  startedAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'Null while the clock runs. Set once the session is stopped and waits for its review.',
  })
  endedAt!: Date | null;

  @ApiProperty({ type: Titled, description: 'The step being worked on.' })
  step!: Titled;

  @ApiProperty({
    type: Titled,
    description: 'The task that step is under.',
    example: {
      id: '0b9d4e7a-52c1-4f3b-8e6d-7a1c9f204b33',
      title: 'Learn PostgreSQL',
    },
  })
  task!: Titled;

  @ApiProperty({
    type: Titled,
    description: 'The goal that task is under.',
    example: {
      id: '3c8a1f6e-9d24-4b7a-a5e0-6f2d8c4b1a77',
      title: 'Ship my first product',
    },
  })
  goal!: Titled;
}

/**
 * A completed session, as POST /sessions/:id/end returns it: the active
 * session's fields, with the end always set, and the review. A class of
 * its own, not empty fields on Session, so that each shape says exactly
 * what it holds: an active session has no review, and this one was just
 * given one.
 */
export class EndedSession extends Session {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      "When the clock stopped, by the server's clock: now, or earlier if the review was postponed.",
  })
  declare endedAt: Date;

  @ApiProperty({ enum: SESSION_OUTCOMES, example: 'done' })
  outcome!: SessionOutcome;

  @ApiProperty({ minimum: 1, maximum: 5, example: 4 })
  rating!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Wrote three SELECT queries on the orders table.',
    description: 'Null when no note was written.',
  })
  note!: string | null;
}
