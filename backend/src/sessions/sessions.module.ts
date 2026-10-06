import { Module } from '@nestjs/common';
import { GoalsModule } from '../goals/goals.module.js';
import { StepsModule } from '../steps/steps.module.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsRepository } from './sessions.repository.js';
import { SessionsService } from './sessions.service.js';

@Module({
  // GoalsRepository: is the goal yours, and is it active?
  // StepsRepository: is the step open, and holding it while a session
  // starts on it.
  imports: [GoalsModule, StepsModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionsRepository],
})
export class SessionsModule {}
