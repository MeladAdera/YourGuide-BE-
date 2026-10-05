import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { StepsController } from './steps.controller.js';
import { StepsRepository } from './steps.repository.js';
import { StepsService } from './steps.service.js';

@Module({
  // GoalsRepository: is the goal yours, and is it active?
  // TasksRepository: is the task yours, and holding it while a step is added.
  imports: [GoalsModule, TasksModule],
  controllers: [StepsController],
  providers: [StepsService, StepsRepository],
})
export class StepsModule {}
