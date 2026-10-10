import { ApiProperty } from '@nestjs/swagger';

/** The three numbers of one day. */
export class ProgressDay {
  @ApiProperty({
    example: '2026-10-04',
    description: 'A day in your timezone, as YYYY-MM-DD.',
  })
  date!: string;

  @ApiProperty({
    example: 50,
    description:
      'Minutes of the focus sessions that started on this day and have ended, rounded. A running session adds nothing yet.',
  })
  focusMinutes!: number;

  @ApiProperty({
    example: 2,
    description: 'Steps marked done on this day.',
  })
  stepsDone!: number;

  @ApiProperty({
    example: 1,
    description:
      'Times you said "I\'m struggling" on this day and then continued.',
  })
  struggledAndContinued!: number;
}

/** The same three numbers, added up over the days asked for. */
export class ProgressTotals {
  @ApiProperty({ example: 310 })
  focusMinutes!: number;

  @ApiProperty({ example: 9 })
  stepsDone!: number;

  @ApiProperty({ example: 4 })
  struggledAndContinued!: number;
}

/**
 * Your progress over the last days, as the API returns it. Work under an
 * archived goal counts: archiving puts a goal away, it does not erase what
 * was done.
 */
export class Progress {
  @ApiProperty({
    type: [ProgressDay],
    description:
      'Oldest first, today last. Every day is present, with zeros where nothing happened.',
  })
  days!: ProgressDay[];

  @ApiProperty({ type: ProgressTotals })
  totals!: ProgressTotals;
}
