import { Answer } from '../../common/answer.decorator.js';

/** A step title is one line, like a goal and a task title. */
export const MAX_STEP_TITLE = 200;

/**
 * A new step: one piece of a task, small enough to finish in one sitting.
 * Only a title. The task comes from the path, the step is placed last, and
 * it starts not done.
 */
export class CreateStepDto {
  @Answer({
    example: 'Understand SELECT',
    description: 'One small piece of the task.',
    max: MAX_STEP_TITLE,
  })
  title!: string;
}
