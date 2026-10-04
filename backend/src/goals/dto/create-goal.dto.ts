import { Answer } from '../../common/answer.decorator.js';

/** A goal title is one line, not a paragraph. */
export const MAX_GOAL_TITLE = 200;

/**
 * A new goal. The title says where the person wants to go. The why is
 * required: "it knows my goal and why it matters to me" is what the app is
 * built on, and advice for a hard moment on this goal uses this why, not
 * another goal's. The other two answers are optional.
 *
 * These are the questions the onboarding wizard ends with, and the same
 * ones every later goal is created with. There is one place a goal lives.
 */
export class CreateGoalDto {
  @Answer({
    example: 'Ship my first product',
    description: 'What would you like to change or accomplish?',
    max: MAX_GOAL_TITLE,
  })
  title!: string;

  @Answer({
    example: 'I want to build my own products without waiting for anyone.',
    description: 'Why does it matter to you?',
  })
  whyItMatters!: string;

  @Answer({
    example: 'I open the editor, feel lost, and switch to something easier.',
    description: 'What might get in the way?',
    optional: true,
  })
  obstacle?: string | null;

  @Answer({
    example: 'One small project online that someone other than me uses.',
    description: 'What would be the first sign you are moving?',
    optional: true,
  })
  firstOutcome?: string | null;
}
