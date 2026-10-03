import { Answer } from '../../answer.decorator.js';

/** Screen 2, your days now: "where am I now?", before any talk of goals. */
export class UpsertSituationDto {
  @Answer({
    example:
      'Up at 7, work until 6, then I am too tired to do anything for myself.',
    description: 'What does your typical day look like?',
  })
  typicalDay!: string;

  @Answer({
    example: 'The evenings. They disappear into my phone.',
    description: 'What would you most like to change?',
  })
  wantToChange!: string;

  @Answer({
    example: 'My job is stable and I like the people.',
    description: 'What part of your life are you satisfied with?',
    optional: true,
  })
  satisfiedWith?: string | null;

  @Answer({
    example: 'Building my own things.',
    description: 'What do you wish you had more time for?',
    optional: true,
  })
  wishMoreTimeFor?: string | null;
}
