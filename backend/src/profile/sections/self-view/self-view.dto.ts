import { ApiProperty } from '@nestjs/swagger';

/** Screen 5 as the API returns it. Optional answers left out are null. */
export class SelfView {
  @ApiProperty()
  whoIAm!: string;

  @ApiProperty({ nullable: true, type: String })
  goodAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  othersComeToMeFor!: string | null;

  @ApiProperty({ nullable: true, type: String })
  stillFiguringOut!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
