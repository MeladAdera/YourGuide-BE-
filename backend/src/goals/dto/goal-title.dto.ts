import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** A goal title is one line, not a paragraph. */
export const MAX_GOAL_TITLE = 200;

/**
 * The one thing the client can say about a goal: its title. Used by both
 * POST (create) and PATCH (rename); everything else about a goal is set by
 * the server.
 */
export class GoalTitleDto {
  @ApiProperty({ example: 'Ship my first product', maxLength: MAX_GOAL_TITLE })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_GOAL_TITLE)
  title!: string;
}
