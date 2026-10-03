import { ApiProperty } from '@nestjs/swagger';
import { Achievements } from '../sections/achievements/achievements.dto.js';
import { Basics } from '../sections/basics/basics.dto.js';
import { Confidence } from '../sections/confidence/confidence.dto.js';
import { Patterns } from '../sections/patterns/patterns.dto.js';
import { SelfView } from '../sections/self-view/self-view.dto.js';
import { Situation } from '../sections/situation/situation.dto.js';
import { Values } from '../sections/values/values.dto.js';

/**
 * Screens 1–7 as the API returns them inside the profile. A screen that is
 * not saved is null. Once onboarding is complete only `basics` can be
 * null, because it is the one optional screen.
 */
export class ProfileSections {
  @ApiProperty({ type: Basics, nullable: true })
  basics!: Basics | null;

  @ApiProperty({ type: Situation, nullable: true })
  situation!: Situation | null;

  @ApiProperty({ type: Achievements, nullable: true })
  achievements!: Achievements | null;

  @ApiProperty({ type: Patterns, nullable: true })
  patterns!: Patterns | null;

  @ApiProperty({ type: SelfView, nullable: true })
  selfView!: SelfView | null;

  @ApiProperty({ type: Confidence, nullable: true })
  confidence!: Confidence | null;

  @ApiProperty({ type: Values, nullable: true })
  values!: Values | null;
}

/**
 * The profile as the API returns it: the direction (screen 8) at the top
 * level, the other screens under `sections`. No user_id: it is always
 * your own.
 */
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

  @ApiProperty({ nullable: true, type: String })
  firstOutcome!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When onboarding was finished. Never changes.',
  })
  completedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: ProfileSections })
  sections!: ProfileSections;
}

/** The direction alone, as the `profiles` table holds it. */
export type Direction = Omit<Profile, 'sections'>;
