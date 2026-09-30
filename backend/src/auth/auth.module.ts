import { Module } from '@nestjs/common';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersRepository } from './users.repository.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, UsersRepository, AuthSessionsRepository],
})
export class AuthModule {}
