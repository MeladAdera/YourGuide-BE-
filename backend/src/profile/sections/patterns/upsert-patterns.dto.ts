import { Answer } from '../../answer.decorator.js';

/**
 * Screen 4, what gets in the way: patterns the person already knows about.
 * The wording is about habits and lessons, never about what is wrong with
 * them, and the more personal question is the optional one.
 */
export class UpsertPatternsDto {
  @Answer({
    example: 'Starting the hard task of the day. I tidy the easy ones first.',
    description: 'What do you keep postponing or avoiding?',
  })
  oftenPostpone!: string;

  @Answer({
    example:
      'I waited a year to show my work to anyone. Feedback early would have saved months.',
    description: 'A mistake or regret that taught you something.',
    optional: true,
  })
  lessonFromMistake?: string | null;

  @Answer({
    example: 'Checking my phone the moment something gets difficult.',
    description: 'A habit or pattern you would like to change.',
    optional: true,
  })
  patternToChange?: string | null;
}
