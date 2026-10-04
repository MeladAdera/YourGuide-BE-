import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { OnboardingStatus } from './dto/onboarding-status.dto.js';
import { Profile } from './dto/profile.dto.js';
import { OnboardingRepository } from './onboarding.repository.js';
import { REQUIRED_SCREENS } from './screens.js';
import { SectionsService } from './sections/sections.service.js';

@Injectable()
export class ProfileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly onboarding: OnboardingRepository,
    private readonly sections: SectionsService,
  ) {}

  /**
   * The whole profile, once onboarding is complete. Until then 404: not an
   * error in the data, this user has simply not finished the wizard, and
   * the frontend shows it on this answer.
   */
  async get(userId: string): Promise<Profile> {
    const profile = await this.sections.findAll(userId);
    if (REQUIRED_SCREENS.some((screen) => profile[screen] === null)) {
      throw new NotFoundException('Onboarding is not done yet.');
    }
    return profile;
  }

  /** Where the person is in onboarding. Never 404. */
  async status(userId: string): Promise<OnboardingStatus> {
    const screens = await this.onboarding.savedScreens(this.db.pool, userId);
    const missing = REQUIRED_SCREENS.filter((screen) => !screens[screen]);
    return { completed: missing.length === 0, screens, missing };
  }

  /**
   * The one order rule: the goal comes after the reflection. Called before
   * a goal is created; answers 409, with the screens still missing, until
   * the six required screens are saved.
   *
   * A screen cannot be deleted, so once this passes for a user it always
   * passes: there is no gap to close with a transaction.
   */
  async requireOnboarded(userId: string): Promise<void> {
    const { missing } = await this.status(userId);
    if (missing.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'Finish these screens first.',
        missing,
      });
    }
  }
}
