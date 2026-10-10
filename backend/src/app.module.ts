import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { HealthModule } from './health/health.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { StepsModule } from './steps/steps.module.js';
import { TasksModule } from './tasks/tasks.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    ProfileModule,
    GoalsModule,
    TasksModule,
    StepsModule,
    SessionsModule,
    ProgressModule,
  ],
})
export class AppModule {}
