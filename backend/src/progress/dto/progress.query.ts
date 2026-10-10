import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/** The most days one call answers: enough for a quarter, cheap to count. */
export const MAX_PROGRESS_DAYS = 90;
export const DEFAULT_PROGRESS_DAYS = 7;

/**
 * `GET /api/progress?days=7`. Query values are always text, so `days` is
 * checked as text: one or two digits, 1 to 90. Left out means 7, the
 * week the progress page and the AI advice both look at.
 */
export class ProgressQuery {
  @ApiPropertyOptional({
    type: String,
    example: '7',
    default: String(DEFAULT_PROGRESS_DAYS),
    description: `How many days, ending today, from 1 to ${String(MAX_PROGRESS_DAYS)}.`,
  })
  @IsOptional()
  @Matches(/^(?:[1-9]|[1-8][0-9]|90)$/, {
    message: `days must be a whole number from 1 to ${String(MAX_PROGRESS_DAYS)}`,
  })
  days?: string;
}
