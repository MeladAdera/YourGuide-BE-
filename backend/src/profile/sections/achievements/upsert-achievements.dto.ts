import { Answer } from '../../../common/answer.decorator.js';

/**
 * Screen 3, what you have done: evidence of what the person can do, so
 * later advice can point at their own track record.
 */
export class UpsertAchievementsDto {
  @Answer({
    example: 'I taught myself to code while working full time.',
    description:
      'Something you achieved, got through, or surprised yourself with.',
  })
  proudOf!: string;

  @Answer({
    example: 'Keeping going for months with nothing to show yet.',
    description: 'What was difficult about it?',
    optional: true,
  })
  whatWasHard?: string | null;

  @Answer({
    example: 'I can stick with something when I see small progress.',
    description: 'What did you learn about yourself from it?',
    optional: true,
  })
  learnedAboutSelf?: string | null;
}
