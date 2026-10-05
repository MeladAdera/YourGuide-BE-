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
import { CreateTaskDto } from './dto/create-task.dto.js';
import { Task } from './dto/task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

const NO_GOAL = 'No such goal, or it belongs to someone else.';
const NO_TASK = 'No such task, or it belongs to someone else.';
const BAD_ID = 'The id is not a UUID.';
const BAD_TITLE =
  'An empty title, one over 200 characters, or an unknown field.';
const ARCHIVED =
  'The goal is archived. Nothing under it changes until it is unarchived.';

// No path on the controller: a task is created and listed under its goal
// (/goals/:goalId/tasks), and changed by its own id (/tasks/:id). Once a
// task exists its id is enough; the client need not remember the goal.
//
// An archived goal is read-only: the list works, the three writes are 409.
//
// No @Public() anywhere here: every route needs a login. The decorators on
// the class apply to every route in it.
@ApiTags('tasks')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @ApiOperation({ summary: 'The tasks of a goal, each with its status' })
  @ApiOkResponse({
    type: [Task],
    description: 'Oldest first. An archived goal lists its tasks too.',
  })
  @ApiBadRequestResponse({ description: BAD_ID })
  @ApiNotFoundResponse({ description: NO_GOAL })
  @Get('goals/:goalId/tasks')
  list(
    @CurrentUser() userId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
  ): Promise<Task[]> {
    return this.tasks.list(userId, goalId);
  }

  @ApiOperation({ summary: 'Add a task to a goal' })
  @ApiCreatedResponse({
    type: Task,
    description: 'The new task. It has no steps yet, so it is `todo`.',
  })
  @ApiBadRequestResponse({
    description: `A missing title. ${BAD_TITLE} Or: ${BAD_ID}`,
  })
  @ApiNotFoundResponse({ description: NO_GOAL })
  @ApiConflictResponse({ description: ARCHIVED })
  @Post('goals/:goalId/tasks')
  create(
    @CurrentUser() userId: string,
    @Param('goalId', ParseUUIDPipe) goalId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<Task> {
    return this.tasks.create(userId, goalId, dto);
  }

  // The status cannot be sent: it follows the steps.
  @ApiOperation({ summary: 'Rename a task' })
  @ApiOkResponse({ type: Task })
  @ApiBadRequestResponse({
    description: `${BAD_TITLE} Or null for the title. Or: ${BAD_ID}`,
  })
  @ApiNotFoundResponse({ description: NO_TASK })
  @ApiConflictResponse({ description: ARCHIVED })
  @Patch('tasks/:id')
  update(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<Task> {
    return this.tasks.update(userId, id, dto);
  }

  @ApiOperation({
    summary: 'Delete a task that has no work history, with its steps',
  })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiBadRequestResponse({ description: BAD_ID })
  @ApiNotFoundResponse({ description: NO_TASK })
  @ApiConflictResponse({
    description: `${ARCHIVED} Or: the task has work history (a focus session on one of its steps).`,
  })
  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tasks.delete(userId, id);
  }
}
