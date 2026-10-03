import { ApiProperty } from '@nestjs/swagger';

/** Screen 3 as the API returns it. Optional answers left out are null. */
export class Achievements {
  @ApiProperty()
  proudOf!: string;

  @ApiProperty({ nullable: true, type: String })
  whatWasHard!: string | null;

  @ApiProperty({ nullable: true, type: String })
  learnedAboutSelf!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
