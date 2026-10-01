import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { DatabaseService } from '../database/database.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  // The hosting platform calls this without a login.
  @ApiOperation({ summary: 'Is the API up and the database reachable?' })
  @ApiOkResponse({
    description: 'Both are fine.',
    schema: { example: { status: 'ok' } },
  })
  @ApiServiceUnavailableResponse({
    description: 'The database did not answer.',
  })
  @Public()
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.db.ping();
    } catch {
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ok' };
  }
}
