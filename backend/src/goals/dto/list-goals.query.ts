import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/**
 * `GET /api/goals?archived=true`. Query values are always text, so this is
 * the string 'true' or 'false', not a boolean. Left out means 'false':
 * the normal list is the active goals.
 */
export class ListGoalsQuery {
  @ApiPropertyOptional({
    enum: ['false', 'true'],
    default: 'false',
    description: '`true` lists the archived goals instead of the active ones.',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: 'true' | 'false';
}
