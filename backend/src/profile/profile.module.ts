import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller.js';
import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';
import { AchievementsRepository } from './sections/achievements/achievements.repository.js';
import { BasicsRepository } from './sections/basics/basics.repository.js';
import { ConfidenceRepository } from './sections/confidence/confidence.repository.js';
import { PatternsRepository } from './sections/patterns/patterns.repository.js';
import { SectionsController } from './sections/sections.controller.js';
import { SectionsService } from './sections/sections.service.js';
import { SelfViewRepository } from './sections/self-view/self-view.repository.js';
import { SituationRepository } from './sections/situation/situation.repository.js';
import { MeaningRepository } from './sections/values/meaning.repository.js';
import { ValuesRepository } from './sections/values/values.repository.js';

@Module({
  controllers: [ProfileController, SectionsController],
  providers: [
    ProfileService,
    ProfileRepository,
    SectionsService,
    BasicsRepository,
    SituationRepository,
    AchievementsRepository,
    PatternsRepository,
    SelfViewRepository,
    ConfidenceRepository,
    MeaningRepository,
    ValuesRepository,
  ],
})
export class ProfileModule {}
