import { ApiProperty } from '@nestjs/swagger';

/** Screen 4 as the API returns it. Optional answers left out are null. */
export class Patterns {
  @ApiProperty()
  oftenPostpone!: string;

  @ApiProperty({ nullable: true, type: String })
  lessonFromMistake!: string | null;

  @ApiProperty({ nullable: true, type: String })
  patternToChange!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
