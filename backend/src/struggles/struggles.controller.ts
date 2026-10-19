import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AnswerStruggleDto } from './dto/answer-struggle.dto.js';
import { CreateStruggleDto } from './dto/create-struggle.dto.js';
import { Struggle } from './dto/struggle.dto.js';
import { StrugglesService } from './struggles.service.js';

// The button that the app exists for. One POST does the whole thing: the
// person's words go in, advice and one next step come back, and the
// struggle is saved with them. The session is not in the body: the server
// attaches the one that is open.
//
// No @Public() anywhere here: every route needs a login.
@ApiTags('struggles')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller('struggles')
export class StrugglesController {
  constructor(private readonly struggles: StrugglesService) {}

  @ApiOperation({
    summary:
      "I'm struggling: say what is happening, get advice and one next step",
  })
  @ApiCreatedResponse({
    type: Struggle,
    description:
      'The struggle with its advice, in your language. Linked to the focus session that was open, if any. The call waits for the model: a few seconds, sometimes more.',
  })
  @ApiBadRequestResponse({
    description:
      'A missing or unknown `situation`, a missing, empty or too long `description`, or an unknown field (`sessionId` is one: the server attaches the open session itself).',
  })
  @ApiConflictResponse({
    description:
      'Onboarding is not complete (`struggle.onboarding_required`, with the screens still `missing`).',
  })
  @ApiTooManyRequestsResponse({
    description:
      "Today's advice is used up (`ai.daily_limit`). Nothing was sent to the model.",
  })
  @ApiServiceUnavailableResponse({
    description:
      'The model could not answer in time (`ai.unavailable`). Nothing was saved; try again in a minute.',
  })
  @Post()
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateStruggleDto,
  ): Promise<Struggle> {
    return this.struggles.create(userId, dto);
  }

  // PATCH, because one field of the struggle changes, once. The answer is
  // what the progress page counts as "struggled and continued".
  @ApiOperation({ summary: 'Did you continue? Answer once' })
  @ApiOkResponse({
    type: Struggle,
    description: 'The struggle with `continued` set.',
  })
  @ApiBadRequestResponse({
    description:
      '`continued` is missing or not a boolean, or an unknown field. Or the id is not a UUID.',
  })
  @ApiNotFoundResponse({
    description: 'No such struggle, or it belongs to someone else.',
  })
  @ApiConflictResponse({
    description: 'Already answered (`struggle.already_answered`).',
  })
  @Patch(':id')
  answer(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnswerStruggleDto,
  ): Promise<Struggle> {
    return this.struggles.answer(userId, id, dto);
  }
}
