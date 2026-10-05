import { Changed } from '../../common/answer.decorator.js';
import { MAX_TASK_TITLE } from './create-task.dto.js';

/**
 * PATCH changes only what is sent, like PATCH on a goal. A task has one
 * thing to change, its title: left out is unchanged, `null` is refused.
 *
 * The status is not here. It cannot be set: it follows the steps.
 */
export class UpdateTaskDto {
  @Changed({
    example: 'Learn PostgreSQL well enough to design a schema',
    max: MAX_TASK_TITLE,
  })
  title?: string;
}
