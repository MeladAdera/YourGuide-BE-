import { Answer } from '../../common/answer.decorator.js';

/** A task title is one line, like a goal title. */
export const MAX_TASK_TITLE = 200;

/**
 * A new task: a meaningful piece of work inside a goal. Only a title. The
 * goal comes from the path, the status from the steps, and the why is the
 * goal's own.
 */
export class CreateTaskDto {
  @Answer({
    example: 'Learn PostgreSQL',
    description: 'A piece of work inside the goal.',
    max: MAX_TASK_TITLE,
  })
  title!: string;
}
