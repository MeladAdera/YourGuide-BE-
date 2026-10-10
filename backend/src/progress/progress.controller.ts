import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Progress } from './dto/progress.dto.js';
import { MAX_PROGRESS_DAYS, ProgressQuery } from './dto/progress.query.js';
import { ProgressService } from './progress.service.js';

// One route, read-only. The frontend's progress page calls it with 7 or
// 30; the AI advice (week 6) reads the same 7 days before it says
// anything.
//
// No @Public(): it needs a login. The decorators on the class apply to
// every route in it.
@ApiTags('progress')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @ApiOperation({
    summary:
      'Your last days: focus minutes, steps done, and times you struggled and continued',
  })
  @ApiOkResponse({
    type: Progress,
    description:
      'One entry per day in your timezone, oldest first, today last, and the totals.',
  })
  @ApiBadRequestResponse({
    description: `\`days\` is not a whole number from 1 to ${String(MAX_PROGRESS_DAYS)}, or an unknown query field.`,
  })
  @Get()
  lastDays(
    @CurrentUser() userId: string,
    @Query() query: ProgressQuery,
  ): Promise<Progress> {
    return this.progress.lastDays(userId, query);
  }
}
