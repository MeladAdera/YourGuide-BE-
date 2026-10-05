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
import { CreateStepDto } from './dto/create-step.dto.js';
import { Step } from './dto/step.dto.js';
import { UpdateStepDto } from './dto/update-step.dto.js';
import { StepsService } from './steps.service.js';

const NO_TASK = 'No such task, or it belongs to someone else.';
const NO_STEP = 'No such step, or it belongs to someone else.';
const BAD_ID = 'The id is not a UUID.';
const BAD_TITLE =
  'An empty title, one over 200 characters, or an unknown field.';
const ARCHIVED =
  'The goal is archived. Nothing under it changes until it is unarchived.';

// The same two shapes of path as tasks: a step is created and listed under
// its task (/tasks/:taskId/steps), and changed by its own id (/steps/:id).
//
// An archived goal is read-only: the list works, the three writes are 409.
//
// No @Public() anywhere here: every route needs a login. The decorators on
// the class apply to every route in it.
@ApiTags('steps')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller()
export class StepsController {
  constructor(private readonly steps: StepsService) {}

  @ApiOperation({ summary: 'The steps of a task, in order' })
  @ApiOkResponse({
    type: [Step],
    description: 'In order. The order of the list is the order of the steps.',
  })
  @ApiBadRequestResponse({ description: BAD_ID })
  @ApiNotFoundResponse({ description: NO_TASK })
  @Get('tasks/:taskId/steps')
  list(
    @CurrentUser() userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ): Promise<Step[]> {
    return this.steps.list(userId, taskId);
  }

  @ApiOperation({ summary: 'Add a step to a task, after its last step' })
  @ApiCreatedResponse({
    type: Step,
    description: 'The new step, not done. It is now the last of the task.',
  })
  @ApiBadRequestResponse({
    description: `A missing title. ${BAD_TITLE} Or: ${BAD_ID}`,
  })
  @ApiNotFoundResponse({ description: NO_TASK })
  @ApiConflictResponse({ description: ARCHIVED })
  @Post('tasks/:taskId/steps')
  create(
    @CurrentUser() userId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateStepDto,
  ): Promise<Step> {
    return this.steps.create(userId, taskId, dto);
  }

  // PATCH with a `done` field, not /done and /undone routes like a goal's
  // archive: done is a checkbox the user ticks, often together with a new
  // title. The time is still the server's.
  @ApiOperation({
    summary: 'Rename a step, mark it done or not done: only what you send',
  })
  @ApiOkResponse({ type: Step })
  @ApiBadRequestResponse({
    description: `${BAD_TITLE} Or null for the title, or a done that is not true or false. Or: ${BAD_ID}`,
  })
  @ApiNotFoundResponse({ description: NO_STEP })
  @ApiConflictResponse({ description: ARCHIVED })
  @Patch('steps/:id')
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStepDto,
  ): Promise<Step> {
    return this.steps.update(userId, id, dto);
  }

  @ApiOperation({ summary: 'Delete a step that has no work history' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiBadRequestResponse({ description: BAD_ID })
  @ApiNotFoundResponse({ description: NO_STEP })
  @ApiConflictResponse({
    description: `${ARCHIVED} Or: the step has work history (a focus session).`,
  })
  @Delete('steps/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.steps.delete(userId, id);
  }
}
