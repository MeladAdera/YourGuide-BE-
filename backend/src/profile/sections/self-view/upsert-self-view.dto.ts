import { Answer, MAX_LONG_ANSWER } from '../../../common/answer.decorator.js';

/**
 * Screen 5, how you see yourself: "who am I?", asked after the concrete
 * screens so the person has material to draw on.
 */
export class UpsertSelfViewDto {
  @Answer({
    example:
      'Curious, stubborn, and better at starting than finishing. I care more about doing good work than about being seen doing it.',
    description:
      'Describe yourself honestly. Who are you at this point in your life?',
    max: MAX_LONG_ANSWER,
  })
  whoIAm!: string;

  @Answer({
    example: 'Explaining complicated things simply.',
    description: 'What are you naturally good at?',
    optional: true,
  })
  goodAt?: string | null;

  @Answer({
    example: 'Help with decisions. I ask the questions they avoid.',
    description: 'What do other people usually come to you for?',
    optional: true,
  })
  othersComeToMeFor?: string | null;

  @Answer({
    example: 'Why I lose interest once something starts working.',
    description: 'What are you still trying to understand about yourself?',
    optional: true,
  })
  stillFiguringOut?: string | null;
}
