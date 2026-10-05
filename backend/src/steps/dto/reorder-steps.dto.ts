import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * The whole order of a task's steps: every step's id, each once, first to
 * last. Not "move this step up by one": the client knows the order it
 * wants, and one list says it without a second call that could fail
 * halfway.
 *
 * The DTO can only check the shape. Whether these are the steps of this
 * task is a question for the database, asked in StepsService.reorder.
 */
export class ReorderStepsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    // Made-up ids, to show the shape. This is the one body that cannot be
    // sent as pre-filled: it must name your own steps.
    example: [
      '6f1e5c0a-3b7d-4c2e-9a41-0d8f2b7c1e55',
      '0b9d4e7a-52c1-4f3b-8e6d-7a1c9f204b33',
    ],
    description:
      'The ids of all the steps of the task, each once, in the order you want. Take them from GET /api/tasks/{taskId}/steps.',
  })
  @IsArray()
  @ArrayUnique({ message: 'Each step can be listed only once.' })
  @IsUUID('all', { each: true })
  stepIds!: string[];
}
