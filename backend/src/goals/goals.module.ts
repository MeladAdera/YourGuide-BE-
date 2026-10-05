import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module.js';
import { GoalsController } from './goals.controller.js';
import { GoalsRepository } from './goals.repository.js';
import { GoalsService } from './goals.service.js';

@Module({
  // For ProfileService.requireOnboarded: no goal before the reflection.
  imports: [ProfileModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalsRepository],
  // For TasksService and StepsService: before a write under a goal, the
  // goal is read and locked (see require-active.ts).
  exports: [GoalsRepository],
})
export class GoalsModule {}
