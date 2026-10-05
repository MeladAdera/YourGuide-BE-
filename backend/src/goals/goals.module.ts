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
  // For TasksService: a task is created under a goal it must read first.
  exports: [GoalsRepository],
})
export class GoalsModule {}
