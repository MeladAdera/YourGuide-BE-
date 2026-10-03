import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { OnboardingStatus } from './dto/onboarding-status.dto.js';
import { Profile } from './dto/profile.dto.js';
import { UpsertProfileDto } from './dto/upsert-profile.dto.js';
import { OnboardingRepository } from './onboarding.repository.js';
import { ProfileRepository } from './profile.repository.js';
import { REQUIRED_SCREENS } from './screens.js';
import { SectionsService } from './sections/sections.service.js';

@Injectable()
export class ProfileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly profiles: ProfileRepository,
    private readonly onboarding: OnboardingRepository,
    private readonly sections: SectionsService,
  ) {}

  async get(userId: string): Promise<Profile> {
    const direction = await this.profiles.findByUserId(this.db.pool, userId);
    if (direction === undefined) {
      // Not an error in the data: this user has not done onboarding yet.
      // The frontend shows the onboarding wizard on this answer.
      throw new NotFoundException('Onboarding is not done yet.');
    }
    return { ...direction, sections: await this.sections.findAll(userId) };
  }

  /** Where the person is in onboarding. Never 404. */
  async status(userId: string): Promise<OnboardingStatus> {
    const saved = await this.onboarding.savedScreens(this.db.pool, userId);
    const { direction, ...screens } = saved;
    return {
      completed: direction,
      screens,
      missing: REQUIRED_SCREENS.filter((screen) => !saved[screen]),
    };
  }

  /**
   * Saves the direction and completes onboarding. This is where the one
   * order rule lives: the goal comes after the reflection, so screens 2–7
   * must exist first. 409, with the missing screens, otherwise.
   */
  async upsert(userId: string, input: UpsertProfileDto): Promise<Profile> {
    const { missing } = await this.status(userId);
    if (missing.length > 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'Finish these screens first.',
        missing,
      });
    }
    const direction = await this.profiles.upsert(this.db.pool, userId, input);
    return { ...direction, sections: await this.sections.findAll(userId) };
  }
}
