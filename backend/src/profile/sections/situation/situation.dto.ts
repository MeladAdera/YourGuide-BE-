import { ApiProperty } from '@nestjs/swagger';

/** Screen 2 as the API returns it. Optional answers left out are null. */
export class Situation {
  @ApiProperty()
  typicalDay!: string;

  @ApiProperty()
  wantToChange!: string;

  @ApiProperty({ nullable: true, type: String })
  satisfiedWith!: string | null;

  @ApiProperty({ nullable: true, type: String })
  wishMoreTimeFor!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
