import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { StrugglesController } from './struggles.controller.js';
import { StrugglesRepository } from './struggles.repository.js';
import { StrugglesService } from './struggles.service.js';

@Module({
  // AiModule: the model that writes the advice.
  // ProfileModule: is onboarding complete, and the profile for the prompt.
  // AuthModule: the user's language.
  // SessionsModule: the session that is open, with its step, task and goal.
  // GoalsModule: the goal in full, or every active goal.
  // ProgressModule: the last 7 days.
  imports: [
    AiModule,
    ProfileModule,
    AuthModule,
    SessionsModule,
    GoalsModule,
    ProgressModule,
  ],
  controllers: [StrugglesController],
  providers: [StrugglesService, StrugglesRepository],
})
export class StrugglesModule {}
