import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  // For GoalsRepository: is the goal yours, and is it active?
  imports: [GoalsModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
