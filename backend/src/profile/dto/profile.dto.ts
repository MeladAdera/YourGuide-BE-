import { ApiProperty } from '@nestjs/swagger';

/** The profile as the API returns it. No user_id: it is always your own. */
export class Profile {
  @ApiProperty({ example: 'Become a stronger full-stack developer' })
  goal!: string;

  @ApiProperty({
    example: 'I want to build my own products without waiting for anyone.',
  })
  whyItMatters!: string;

  @ApiProperty({
    example: 'I open the editor, feel lost, and switch to something easier.',
  })
  usualBlocker!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
