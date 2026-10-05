import { ApiProperty } from '@nestjs/swagger';

/**
 * A step as the API returns it. No user_id: it is always your own.
 *
 * No position either. A list of steps comes in order, and that order is
 * the only thing a client needs: the numbers behind it can have gaps
 * (delete the second of three and they are 1 and 3).
 */
export class Step {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The task this step is under.' })
  taskId!: string;

  @ApiProperty({ example: 'Understand SELECT' })
  title!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the step was marked done. Null while it is not done.',
  })
  doneAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
