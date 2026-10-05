import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * A few sentences. Generous on purpose: the limit exists so nobody can
 * store megabytes in a text column, not to cut anyone short.
 */
export const MAX_ANSWER = 1000;
/** The one essay-sized answer: "who are you at this point in your life?" */
export const MAX_LONG_ANSWER = 3000;
/** A short label, such as an occupation. */
export const MAX_SHORT_ANSWER = 120;
/** A note on one picked value: a sentence or two. */
export const MAX_NOTE = 300;

interface AnswerOptions {
  example: string;
  /** The question, shown in Swagger. */
  description?: string;
  max?: number;
  /** May be left out or sent as null, which clears the answer. */
  optional?: boolean;
}

/**
 * A free-text answer: a non-empty string up to `max` characters. Used by
 * the onboarding screens and by goals. One decorator, so every answer field
 * follows the same rule and Swagger describes it the same way.
 */
export function Answer(options: AnswerOptions): PropertyDecorator {
  const max = options.max ?? MAX_ANSWER;
  // `type: String` is stated, not inferred. An optional answer is typed
  // `string | null`, and for a union TypeScript emits "Object" as the
  // runtime type, so Swagger would publish the field as an object.
  const property =
    options.description === undefined
      ? { type: String, example: options.example, maxLength: max }
      : {
          type: String,
          example: options.example,
          maxLength: max,
          description: options.description,
        };
  return applyDecorators(
    ...(options.optional === true
      ? [ApiPropertyOptional({ ...property, nullable: true }), IsOptional()]
      : [ApiProperty(property)]),
    IsString(),
    MinLength(1),
    MaxLength(max),
  );
}

/**
 * A required answer inside a PATCH. It may be left out, which leaves it
 * unchanged; if it is sent, it must be valid. `null` is refused, because a
 * required answer cannot be cleared.
 *
 * `@IsOptional()` would be wrong here: it skips validation for `null` too,
 * so `{ "title": null }` would be accepted and silently ignored.
 * `@ValidateIf` skips the field only when it is really absent.
 */
export function Changed(options: {
  example: string;
  max: number;
}): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      type: String,
      example: options.example,
      maxLength: options.max,
    }),
    ValidateIf((_body: unknown, value: unknown) => value !== undefined),
    IsString(),
    MinLength(1),
    MaxLength(options.max),
  );
}
