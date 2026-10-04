import { ApiProperty } from '@nestjs/swagger';

/** A goal as the API returns it. No user_id: it is always your own. */
export class Goal {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ship my first product' })
  title!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the goal was archived. Null while it is active.',
  })
  archivedAt!: Date | null;
}
