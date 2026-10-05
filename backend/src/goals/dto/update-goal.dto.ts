import { Answer, Changed, MAX_ANSWER } from '../../common/answer.decorator.js';
import { MAX_GOAL_TITLE } from './create-goal.dto.js';

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
