import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { StepsModule } from '../steps/steps.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { BreakdownController } from './breakdown.controller.js';
import { BreakdownService } from './breakdown.service.js';

@Module({
  // AiModule: the model, and the daily limit.
  // TasksModule, GoalsModule: is the task yours, is its goal active.
  // StepsModule: the steps the task already has.
  // AuthModule: the account's language, the fallback for the steps.
  imports: [AiModule, TasksModule, GoalsModule, StepsModule, AuthModule],
  controllers: [BreakdownController],
  providers: [BreakdownService],
})
export class BreakdownModule {}
