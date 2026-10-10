import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { Answer } from '../../common/answer.decorator.js';
import { SESSION_OUTCOMES } from '../session-outcome.js';
// `import type`: a decorated class emits type metadata, and this is only a
// type (the array above is the runtime value).
import type { SessionOutcome } from '../session-outcome.js';

/**
 * The review that ends a focus session: how it went, how it felt, and
 * optionally what was done. Not an end time. The time is the server's,
 * like the start, so a session cannot be made longer or moved to another
 * day of the progress page.
 */
export class EndSessionDto {
  @ApiProperty({
    enum: SESSION_OUTCOMES,
    example: 'done',
    description:
      'How the session went. `done` also marks the step done. The other four leave the step as it is.',
  })
  @IsIn(SESSION_OUTCOMES)
  outcome!: SessionOutcome;

  @ApiProperty({
    minimum: 1,
    maximum: 5,
    example: 4,
    description: 'How the session felt, 1 (bad) to 5 (good).',
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @Answer({
    example: 'Wrote three SELECT queries on the orders table.',
    description: 'What did you do? A short note. Optional.',
    optional: true,
  })
  note?: string | null;
}
