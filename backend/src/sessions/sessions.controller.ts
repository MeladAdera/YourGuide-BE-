import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Session } from './dto/session.dto.js';
import { StartSessionDto } from './dto/start-session.dto.js';
import { SessionsService } from './sessions.service.js';

// A focus session is not under a task or a step in the path, although it
// starts on a step: a user has one running session at most, so "the
// running one" needs no id at all (/sessions/active).
//
// No @Public() anywhere here: every route needs a login. The decorators on
// the class apply to every route in it.
@ApiTags('sessions')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  // The step travels in the body, not the path: the session is the thing
  // created, and the step is what it is about.
  @ApiOperation({ summary: 'Start a focus session on a step' })
  @ApiCreatedResponse({
    type: Session,
    description: 'The session, running since `startedAt`.',
  })
  @ApiBadRequestResponse({
    description:
      'A missing `stepId`, one that is not a UUID, or an unknown field.',
  })
  @ApiNotFoundResponse({
    description: 'No such step, or it belongs to someone else.',
  })
  @ApiConflictResponse({
    description:
      'The goal is archived (`goal.archived`). Or the step is already done (`session.step_done`). Or a session is already running (`session.already_active`).',
  })
  @Post()
  start(
    @CurrentUser() userId: string,
    @Body() dto: StartSessionDto,
  ): Promise<Session> {
    return this.sessions.start(userId, dto);
  }

  // 404, not 200 with null, when nothing is running: the same answer an
  // onboarding screen gives while it is not saved yet.
  @ApiOperation({ summary: 'The focus session that is running now' })
  @ApiOkResponse({ type: Session })
  @ApiNotFoundResponse({ description: 'No session is running.' })
  @Get('active')
  active(@CurrentUser() userId: string): Promise<Session> {
    return this.sessions.active(userId);
  }
}
