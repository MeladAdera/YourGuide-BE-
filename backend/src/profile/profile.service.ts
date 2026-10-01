import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { Profile } from './dto/profile.dto.js';
import { UpsertProfileDto } from './dto/upsert-profile.dto.js';
import { ProfileRepository } from './profile.repository.js';

@Injectable()
export class ProfileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly profiles: ProfileRepository,
  ) {}

  async get(userId: string): Promise<Profile> {
    const profile = await this.profiles.findByUserId(this.db.pool, userId);
    if (profile === undefined) {
      // Not an error in the data: this user has not done onboarding yet.
      // The frontend shows the onboarding screen on this answer.
      throw new NotFoundException('Onboarding is not done yet.');
    }
    return profile;
  }

  upsert(userId: string, input: UpsertProfileDto): Promise<Profile> {
    return this.profiles.upsert(this.db.pool, userId, input);
  }
}
