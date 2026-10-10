import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller.js';
import { ProgressRepository } from './progress.repository.js';
import { ProgressService } from './progress.service.js';

// Reads sessions, steps and struggles by SQL alone: no other module's
// repository is needed, so nothing is imported.
@Module({
  controllers: [ProgressController],
  providers: [ProgressService, ProgressRepository],
})
export class ProgressModule {}
