import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Starting a focus session takes one thing: the step to work on. Not a
 * start time. The time is the server's, like the time a step is done, so a
 * client cannot put a session on another day of the progress page.
 */
export class StartSessionDto {
  @ApiProperty({
    format: 'uuid',
    // A made-up id, to show the shape. Like `stepIds`, this body cannot be
    // sent as pre-filled: it must name one of your own steps.
    example: '6f1e5c0a-3b7d-4c2e-9a41-0d8f2b7c1e55',
    description:
      'The step to work on. Take it from GET /api/tasks/{taskId}/steps.',
  })
  @IsUUID()
  stepId!: string;
}
