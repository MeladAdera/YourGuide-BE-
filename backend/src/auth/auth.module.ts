import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { UsersRepository } from './users.repository.js';

@Module({
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
