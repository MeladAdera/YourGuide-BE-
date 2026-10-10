import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/** The most days one call looks back: enough for a quarter, cheap to read. */
export const MAX_DAYS = 90;
export const DEFAULT_DAYS = 7;

/**
 * `?days=7` on the routes that look back: progress, and the session
 * history. Query values are always text, so `days` is checked as text:
 * one or two digits, 1 to 90. Left out means 7, the week the progress
 * page and the AI advice both look at.
 */
export class LastDaysQuery {
  @ApiPropertyOptional({
    type: String,
    example: '7',
    default: String(DEFAULT_DAYS),
    description: `How many days, ending today, from 1 to ${String(MAX_DAYS)}.`,
  })
  @IsOptional()
  @Matches(/^(?:[1-9]|[1-8][0-9]|90)$/, {
    message: `days must be a whole number from 1 to ${String(MAX_DAYS)}`,
  })
  days?: string;
}

/** The days asked for, as a number, or the default. */
export function daysOf(query: LastDaysQuery): number {
  return Number(query.days ?? DEFAULT_DAYS);
}
