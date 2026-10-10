import {
  Body,
  Controller,
  Get,
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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { EndSessionDto } from './dto/end-session.dto.js';
import { EndedSession, Session } from './dto/session.dto.js';
import { StartSessionDto } from './dto/start-session.dto.js';
import { SessionsService } from './sessions.service.js';

const BAD_ID = 'The id is not a UUID.';

// A focus session is not under a task or a step in the path, although it
// starts on a step: a user has one active session at most, so "the active
// one" needs no id at all (/sessions/active).
//
// A session is active until it is reviewed. Its clock can be stopped
// first (/stop) and the review written later (/end), or both at once
// (/end while it runs). Nothing closes a session but the user, and
// nothing discards one.
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
      'The goal is archived (`goal.archived`). Or the step is already done (`session.step_done`). Or a session is still open, running or awaiting its review (`session.already_active`).',
  })
  @Post()
  start(
    @CurrentUser() userId: string,
    @Body() dto: StartSessionDto,
  ): Promise<Session> {
    return this.sessions.start(userId, dto);
  }

  // 404, not 200 with null, when nothing is active: the same answer an
  // onboarding screen gives while it is not saved yet.
  @ApiOperation({
    summary: 'The session that is open now: running, or awaiting its review',
  })
  @ApiOkResponse({
    type: Session,
    description:
      '`endedAt` is null while the clock runs, and set once the session is stopped and waits for its review.',
  })
  @ApiNotFoundResponse({ description: 'No session is open.' })
  @Get('active')
  active(@CurrentUser() userId: string): Promise<Session> {
    return this.sessions.active(userId);
  }

  // "Later" on the review screen. The clock stops; the review is still
  // owed, so the session stays the active one. No body: there is nothing
  // to say yet.
  @ApiOperation({ summary: 'Stop the clock; review later' })
  @ApiOkResponse({
    type: Session,
    description:
      'The session, stopped at `endedAt` and awaiting its review. Until POST /sessions/{id}/end, no other session can start.',
  })
  @ApiBadRequestResponse({ description: BAD_ID })
  @ApiNotFoundResponse({
    description:
      'No running session with this id: there is none, it belongs to someone else, or its clock has already stopped.',
  })
  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  stop(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Session> {
    return this.sessions.stop(userId, id);
  }

  // The id is in the path, although a user has only one active session.
  // "End the active one" from a tab left open since yesterday would end
  // today's session; with the id it can only end the one it was showing.
  //
  // POST, not PATCH: ending is something that happens to a session, once,
  // like archiving a goal. 200, not the 201 that POST gives by default:
  // nothing new is created.
  @ApiOperation({
    summary: 'End a session with its review: running, or stopped earlier',
  })
  @ApiOkResponse({
    type: EndedSession,
    description:
      'The session, completed. A running session ends now; a stopped one keeps its `endedAt`. With outcome `done` the step is now done too, as of `endedAt`.',
  })
  @ApiBadRequestResponse({
    description: `A missing or unknown outcome, a rating that is not a whole number from 1 to 5, an empty or too long note, or an unknown field. Or: ${BAD_ID}`,
  })
  @ApiNotFoundResponse({
    description:
      'No unreviewed session with this id: there is none, it belongs to someone else, or it has already been reviewed.',
  })
  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EndSessionDto,
  ): Promise<EndedSession> {
    return this.sessions.end(userId, id, dto);
  }
}
