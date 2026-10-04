import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { minutes, ThrottlerModule } from '@nestjs/throttler';
import { API_ERRORS } from '../common/api-error.js';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { UsersRepository } from './users.repository.js';

@Module({
  imports: [
    // The rate limit for register and login: 5 requests per minute per IP,
    // counted in memory. It applies only where a route says
    // @UseGuards(ThrottlerGuard); importing the module alone limits nothing.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: minutes(1), limit: 5 }],
      errorMessage: API_ERRORS.rate_limited.message,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UsersRepository,
    AuthSessionsRepository,
    // APP_GUARD makes the guard run for every route in the app, not only
    // this module's. It is provided here because it needs
    // AuthSessionsRepository, which lives in this module.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
