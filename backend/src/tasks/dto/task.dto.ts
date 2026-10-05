import { ApiProperty } from '@nestjs/swagger';
import { TASK_STATUSES } from '../task-status.js';
// `import type`: a decorated class emits type metadata, and this is only a
// type (the array above is the runtime value).
import type { TaskStatus } from '../task-status.js';

/** A task as the API returns it. No user_id: it is always your own. */
export class Task {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The goal this task is under.' })
  goalId!: string;

  @ApiProperty({ example: 'Learn PostgreSQL' })
  title!: string;

  @ApiProperty({
    enum: TASK_STATUSES,
    example: 'todo',
    description:
      'Read from the steps, never stored: `todo` while no step is done, `in_progress` once one is, `done` when all are.',
  })
  status!: TaskStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
