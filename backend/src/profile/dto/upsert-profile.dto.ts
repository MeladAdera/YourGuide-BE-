import { Answer } from '../../common/answer.decorator.js';

/**
 * Screen 8, your direction. PUT sends the whole screen, every time. It is
 * accepted only once screens 2–7 are saved (409 otherwise), and saving it
 * is what completes onboarding.
 */
export class UpsertProfileDto {
  @Answer({
    example: 'Become a stronger full-stack developer',
    description: 'What would you like to change or accomplish?',
  })
  goal!: string;

  @Answer({
    example: 'I want to build my own products without waiting for anyone.',
    description: 'Why does it matter to you?',
  })
  whyItMatters!: string;

  @Answer({
    example: 'I open the editor, feel lost, and switch to something easier.',
    description: 'What usually stops you?',
  })
  usualBlocker!: string;

  @Answer({
    example: 'One small project online that someone other than me uses.',
    description: 'What would be the first sign you are moving?',
    optional: true,
  })
  firstOutcome?: string | null;
}
