import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
 * A free-text onboarding answer: a non-empty string up to `max` characters.
 * One decorator, so every answer field follows the same rule and Swagger
 * describes it the same way.
 */
export function Answer(options: AnswerOptions): PropertyDecorator {
  const max = options.max ?? MAX_ANSWER;
  const property =
    options.description === undefined
      ? { example: options.example, maxLength: max }
      : {
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
