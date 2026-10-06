import { ApiProperty } from '@nestjs/swagger';

/** An id with its title: enough to show a thing by name and to link to it. */
export class Titled {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Understand SELECT' })
  title!: string;
}

/**
 * A running focus session as the API returns it. No user_id: it is always
 * your own.
 *
 * It names the step, and the task and the goal above it. After a page
 * reload this answer is all the frontend has to draw the timer screen
 * from, and no route reads one step by its id. The titles are read when
 * the answer is built, so a rename shows the next time it is asked for.
 *
 * No duration: the timer is the time now minus `startedAt`, counted by the
 * client. No end, outcome, note or rating: a running session has none.
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
