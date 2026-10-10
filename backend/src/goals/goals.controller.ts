import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { CreateGoalDto } from './dto/create-goal.dto.js';
import { Goal } from './dto/goal.dto.js';
import { ListGoalsQuery } from './dto/list-goals.query.js';
import { UpdateGoalDto } from './dto/update-goal.dto.js';
import { GoalsService } from './goals.service.js';

const NOT_FOUND = 'No such goal, or it belongs to someone else.';
const BAD_ID = 'The id is not a UUID.';
const BAD_ANSWER =
  'A missing or empty required answer, an answer that is too long, or an unknown field.';

// No @Public() anywhere here: every route needs a login. The decorators on
// the class apply to every route in it.
//
// ParseUUIDPipe on every :id answers 400 for an id that is not a UUID.
// Without it PostgreSQL would reject the value and the client would get 500.
@ApiTags('goals')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @ApiOperation({ summary: 'Your goals: active ones, or archived ones' })
  @ApiOkResponse({ type: [Goal], description: 'Oldest first.' })
  @ApiBadRequestResponse({ description: '`archived` is not true or false.' })
  @Get()
  list(
    @CurrentUser() userId: string,
    @Query() query: ListGoalsQuery,
  ): Promise<Goal[]> {
    return this.goals.list(userId, query.archived === 'true');
  }

  // The goal comes after the reflection: 409 until onboarding screens 2–7
  // are saved. The wizard's last step is this very call, so the first goal
  // is typed once and lives in one place.
  @ApiOperation({ summary: 'Create a goal, with why it matters' })
  @ApiCreatedResponse({ type: Goal })
  @ApiBadRequestResponse({ description: BAD_ANSWER })
  @ApiConflictResponse({
    description:
      'Onboarding screens 2–7 are not all saved yet. The body lists them under `missing`.',
  })
  @Post()
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateGoalDto,
  ): Promise<Goal> {
    return this.goals.create(userId, dto);
  }

  // PATCH, not PUT: only the fields that are sent change. A goal is edited
  // one field at a time (renamed in a list, its why rewritten on its page),
  // unlike an onboarding screen, which is always saved whole.
  @ApiOperation({
    summary:
      'Change a goal: only the fields you send; null clears an optional one',
  })
  @ApiOkResponse({ type: Goal })
  @ApiBadRequestResponse({
    description: `An empty or too long answer, null for a required one, or an unknown field. Or: ${BAD_ID}`,
  })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalDto,
  ): Promise<Goal> {
    return this.goals.update(userId, id, dto);
  }

  // POST, not PATCH with a flag: archiving is something that happens to a
  // goal, with its own rule (it keeps the first timestamp), not a field the
  // client sets. 200, not the 201 that POST gives by default: nothing new
  // is created.
  @ApiOperation({
    summary: 'Archive a goal: hidden from the active list, history kept',
  })
  @ApiOkResponse({ type: Goal })
  @ApiBadRequestResponse({ description: BAD_ID })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({
    description:
      'A focus session on one of its steps is not finished: it is running, or stopped and awaiting its review. End it first.',
  })
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Goal> {
    return this.goals.archive(userId, id);
  }

  @ApiOperation({ summary: 'Bring an archived goal back to the active list' })
  @ApiOkResponse({ type: Goal })
  @ApiBadRequestResponse({ description: BAD_ID })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Goal> {
    return this.goals.unarchive(userId, id);
  }

  @ApiOperation({
    summary: 'Delete a goal that has no work history, with its tasks and steps',
  })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiBadRequestResponse({ description: BAD_ID })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({
    description:
      'The goal has work history (a focus session on one of its steps). Archive it instead.',
  })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.goals.delete(userId, id);
  }
}
