import { ApiProperty } from '@nestjs/swagger';

/**
 * The steps the model suggests for a task: titles only, in the order to do
 * them. Returned, not saved. The person accepts or edits them on the
 * screen, which then creates steps with POST /api/tasks/{taskId}/steps.
 */
export class Breakdown {
  @ApiProperty({
    type: [String],
    example: [
      'Read the SELECT chapter of the PostgreSQL tutorial',
      'Write five SELECT queries on the orders table',
      'Add a WHERE and an ORDER BY to each of them',
    ],
    description:
      'Three to seven step titles, each doable in one focus session, in the language of the task title.',
  })
  steps!: string[];
}
