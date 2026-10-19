import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { BreakdownService } from './breakdown.service.js';
import { Breakdown } from './dto/breakdown.dto.js';

// Under /tasks in the path, because it is about one task; in its own
// module, because it is a call to the model, not a change to the task.
// POST without a body, 200 not 201: the model is asked, nothing is created.
//
// No @Public() anywhere here: every route needs a login.
@ApiTags('tasks')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller('tasks')
export class BreakdownController {
  constructor(private readonly breakdown: BreakdownService) {}

  @ApiOperation({ summary: 'Let the model suggest the steps of a task' })
  @ApiOkResponse({
    type: Breakdown,
    description:
      'Three to seven step titles, in order, in the language of the task title. Nothing is saved: create the ones you keep with POST /api/tasks/{taskId}/steps. The call waits for the model: a few seconds, sometimes more.',
  })
  @ApiBadRequestResponse({ description: 'The id is not a UUID.' })
  @ApiNotFoundResponse({
    description: 'No such task, or it belongs to someone else.',
  })
  @ApiConflictResponse({
    description: 'The goal is archived (`goal.archived`).',
  })
  @ApiTooManyRequestsResponse({
    description:
      "Today's model calls are used up (`ai.daily_limit`). Nothing was sent to the model.",
  })
  @ApiServiceUnavailableResponse({
    description:
      'The model could not answer in time, or not with a list of steps (`ai.unavailable`). Try again in a minute.',
  })
  @Post(':id/breakdown')
  @HttpCode(HttpStatus.OK)
  suggest(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Breakdown> {
    return this.breakdown.suggest(userId, id);
  }
}
