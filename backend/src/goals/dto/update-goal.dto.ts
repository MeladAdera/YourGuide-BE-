import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Answer, MAX_ANSWER } from '../../common/answer.decorator.js';
import { MAX_GOAL_TITLE } from './create-goal.dto.js';

/**
 * A required answer inside a PATCH. It may be left out, which leaves it
 * unchanged; if it is sent, it must be valid. `null` is refused, because a
 * required answer cannot be cleared.
 *
 * `@IsOptional()` would be wrong here: it skips validation for `null` too,
 * so `{ "title": null }` would be accepted and silently ignored.
 * `@ValidateIf` skips the field only when it is really absent.
 */
function Changed(options: { example: string; max: number }): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      type: String,
      example: options.example,
      maxLength: options.max,
    }),
    ValidateIf((_goal: unknown, value: unknown) => value !== undefined),
    IsString(),
    MinLength(1),
    MaxLength(options.max),
  );
}

/**
 * PATCH changes only the fields that are sent:
 *
 *   left out   unchanged
 *   a value    replaced
 *   null       cleared (the two optional answers only)
 *
 * That is the difference from the PUT of an onboarding screen, which always
 * sends the whole screen. A goal is edited one field at a time: renamed in
 * a list, or its why rewritten on its page.
 */
export class UpdateGoalDto {
  @Changed({ example: 'Ship my first product, in public', max: MAX_GOAL_TITLE })
  title?: string;

  @Changed({
    example: 'I want to stop waiting for permission.',
    max: MAX_ANSWER,
  })
  whyItMatters?: string;

  @Answer({
    example: 'I polish instead of publishing.',
    description: 'What might get in the way? `null` clears it.',
    optional: true,
  })
  obstacle?: string | null;

  @Answer({
    example: 'A landing page with one real sign-up.',
    description:
      'What would be the first sign you are moving? `null` clears it.',
    optional: true,
  })
  firstOutcome?: string | null;
}
