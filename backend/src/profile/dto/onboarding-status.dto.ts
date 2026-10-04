import { ApiProperty } from '@nestjs/swagger';
import { SCREENS } from '../screens.js';
import type { Screen } from '../screens.js';

/** Which of the seven screens are saved. */
export class ScreenStatus {
  @ApiProperty()
  basics!: boolean;

  @ApiProperty()
  situation!: boolean;

  @ApiProperty()
  achievements!: boolean;

  @ApiProperty()
  patterns!: boolean;

  @ApiProperty()
  selfView!: boolean;

  @ApiProperty()
  confidence!: boolean;

  @ApiProperty()
  values!: boolean;
}

/**
 * Where the person is in onboarding. Never 404: a brand-new user simply
 * has everything false. The wizard reads it once to resume.
 */
export class OnboardingStatus {
  @ApiProperty({
    description:
      'True once the six required screens are saved, which is when `missing` is empty.',
  })
  completed!: boolean;

  @ApiProperty({ type: ScreenStatus })
  screens!: ScreenStatus;

  @ApiProperty({
    enum: SCREENS,
    isArray: true,
    description:
      'Required screens not saved yet. Creating a goal is refused (409) until this is empty.',
  })
  missing!: Screen[];
}
