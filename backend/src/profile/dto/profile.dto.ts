import { ApiProperty } from '@nestjs/swagger';
import { Achievements } from '../sections/achievements/achievements.dto.js';
import { Basics } from '../sections/basics/basics.dto.js';
import { Confidence } from '../sections/confidence/confidence.dto.js';
import { Patterns } from '../sections/patterns/patterns.dto.js';
import { SelfView } from '../sections/self-view/self-view.dto.js';
import { Situation } from '../sections/situation/situation.dto.js';
import { Values } from '../sections/values/values.dto.js';

/**
 * The profile as the API returns it: the seven onboarding screens about the
 * person. Who they are, where they are now, what matters to them. Where
 * they want to go is not here: that is a goal (src/goals).
 *
 * A screen that is not saved is null. Once onboarding is complete only
 * `basics` can be null, because it is the one optional screen.
 * No user_id: the profile is always your own.
 */
export class Profile {
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
