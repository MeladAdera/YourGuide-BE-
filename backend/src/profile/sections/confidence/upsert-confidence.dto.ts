import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/**
 * One check-in statement, answered 1 (strongly disagree) to 5 (strongly
 * agree). The statement itself is the Swagger description, so the API
 * documents the exact wording the frontend must show.
 */
function Statement(text: string): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      description: text,
      minimum: 1,
      maximum: 5,
      example: 4,
    }),
    IsInt(),
    Min(1),
    Max(5),
  );
}

/**
 * Screen 6, quick check-in. All eight are required: it is one screen of
 * taps. The answers are stored as given; there is no total and no score.
 */
export class UpsertConfidenceDto {
  @Statement('I can learn difficult things if I keep at them.')
  canLearnIfPersist!: number;

  @Statement('When I fail, I can usually try again.')
  canTryAgain!: number;

  @Statement('I usually follow through on commitments I make to myself.')
  followThrough!: number;

  @Statement(
    'I can stay focused on something important even when I do not feel motivated.',
  )
  focusWithoutMotivation!: number;

  @Statement('My actions can significantly improve my future.')
  actionsShapeFuture!: number;

  @Statement(
    'I often doubt my ability even when I have evidence that I can succeed.',
  )
  doubtDespiteEvidence!: number;

  @Statement('I avoid difficult situations because I am afraid of failing.')
  avoidWhenAfraid!: number;

  @Statement('I compare myself with other people too much.')
  compareTooMuch!: number;
}
