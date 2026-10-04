import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Achievements } from './achievements/achievements.dto.js';
import { UpsertAchievementsDto } from './achievements/upsert-achievements.dto.js';
import { Basics } from './basics/basics.dto.js';
import { UpsertBasicsDto } from './basics/upsert-basics.dto.js';
import { Confidence } from './confidence/confidence.dto.js';
import { UpsertConfidenceDto } from './confidence/upsert-confidence.dto.js';
import { Patterns } from './patterns/patterns.dto.js';
import { UpsertPatternsDto } from './patterns/upsert-patterns.dto.js';
import { SectionsService } from './sections.service.js';
import { SelfView } from './self-view/self-view.dto.js';
import { UpsertSelfViewDto } from './self-view/upsert-self-view.dto.js';
import { Situation } from './situation/situation.dto.js';
import { UpsertSituationDto } from './situation/upsert-situation.dto.js';
import { UpsertValuesDto } from './values/upsert-values.dto.js';
import { Values } from './values/values.dto.js';

const NOT_SAVED = 'This screen is not saved yet.';
const BAD_INPUT =
  'A missing or empty required answer, an answer that is too long or not in its list, or an unknown field.';

/**
 * One GET and one PUT per onboarding screen. PUT always sends the whole
 * screen and creates or replaces it in one call: the client
 * never has to ask "did I save this already?".
 *
 * No @Public() anywhere here: every route needs a login. The decorators on
 * the class apply to every route in it.
 */
@ApiTags('onboarding')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller('profile/sections')
export class SectionsController {
  constructor(private readonly sections: SectionsService) {}

  @ApiOperation({ summary: 'Screen 1, basics' })
  @ApiOkResponse({ type: Basics })
  @ApiNotFoundResponse({ description: NOT_SAVED })
  @Get('basics')
  getBasics(@CurrentUser() userId: string): Promise<Basics> {
    return this.sections.getBasics(userId);
  }

  @ApiOperation({ summary: 'Save screen 1, basics (create or replace)' })
  @ApiOkResponse({ type: Basics })
  @ApiBadRequestResponse({ description: BAD_INPUT })
  @Put('basics')
  upsertBasics(
    @CurrentUser() userId: string,
    @Body() dto: UpsertBasicsDto,
  ): Promise<Basics> {
    return this.sections.upsertBasics(userId, dto);
  }

  @ApiOperation({ summary: 'Screen 2, your days now' })
  @ApiOkResponse({ type: Situation })
  @ApiNotFoundResponse({ description: NOT_SAVED })
  @Get('situation')
  getSituation(@CurrentUser() userId: string): Promise<Situation> {
    return this.sections.getSituation(userId);
  }

  @ApiOperation({ summary: 'Save screen 2, your days now (create or replace)' })
  @ApiOkResponse({ type: Situation })
  @ApiBadRequestResponse({ description: BAD_INPUT })
  @Put('situation')
  upsertSituation(
    @CurrentUser() userId: string,
    @Body() dto: UpsertSituationDto,
  ): Promise<Situation> {
    return this.sections.upsertSituation(userId, dto);
  }

  @ApiOperation({ summary: 'Screen 3, what you have done' })
  @ApiOkResponse({ type: Achievements })
  @ApiNotFoundResponse({ description: NOT_SAVED })
  @Get('achievements')
  getAchievements(@CurrentUser() userId: string): Promise<Achievements> {
    return this.sections.getAchievements(userId);
  }

  @ApiOperation({
    summary: 'Save screen 3, what you have done (create or replace)',
  })
  @ApiOkResponse({ type: Achievements })
  @ApiBadRequestResponse({ description: BAD_INPUT })
  @Put('achievements')
  upsertAchievements(
    @CurrentUser() userId: string,
    @Body() dto: UpsertAchievementsDto,
  ): Promise<Achievements> {
    return this.sections.upsertAchievements(userId, dto);
  }

  @ApiOperation({ summary: 'Screen 4, what gets in the way' })
  @ApiOkResponse({ type: Patterns })
  @ApiNotFoundResponse({ description: NOT_SAVED })
  @Get('patterns')
  getPatterns(@CurrentUser() userId: string): Promise<Patterns> {
    return this.sections.getPatterns(userId);
  }

  @ApiOperation({
    summary: 'Save screen 4, what gets in the way (create or replace)',
  })
  @ApiOkResponse({ type: Patterns })
  @ApiBadRequestResponse({ description: BAD_INPUT })
  @Put('patterns')
  upsertPatterns(
    @CurrentUser() userId: string,
    @Body() dto: UpsertPatternsDto,
  ): Promise<Patterns> {
    return this.sections.upsertPatterns(userId, dto);
  }

  @ApiOperation({ summary: 'Screen 5, how you see yourself' })
  @ApiOkResponse({ type: SelfView })
  @ApiNotFoundResponse({ description: NOT_SAVED })
  @Get('self-view')
  getSelfView(@CurrentUser() userId: string): Promise<SelfView> {
    return this.sections.getSelfView(userId);
  }

  @ApiOperation({
    summary: 'Save screen 5, how you see yourself (create or replace)',
  })
  @ApiOkResponse({ type: SelfView })
  @ApiBadRequestResponse({ description: BAD_INPUT })
  @Put('self-view')
  upsertSelfView(
    @CurrentUser() userId: string,
    @Body() dto: UpsertSelfViewDto,
  ): Promise<SelfView> {
    return this.sections.upsertSelfView(userId, dto);
  }

  @ApiOperation({ summary: 'Screen 6, quick check-in' })
  @ApiOkResponse({ type: Confidence })
  @ApiNotFoundResponse({ description: NOT_SAVED })
  @Get('confidence')
  getConfidence(@CurrentUser() userId: string): Promise<Confidence> {
    return this.sections.getConfidence(userId);
  }

  @ApiOperation({
    summary: 'Save screen 6, quick check-in (create or replace)',
  })
  @ApiOkResponse({ type: Confidence })
  @ApiBadRequestResponse({
    description:
      'A missing answer, or one that is not a whole number from 1 to 5.',
  })
  @Put('confidence')
  upsertConfidence(
    @CurrentUser() userId: string,
    @Body() dto: UpsertConfidenceDto,
  ): Promise<Confidence> {
    return this.sections.upsertConfidence(userId, dto);
  }

  @ApiOperation({ summary: 'Screen 7, what matters to you' })
  @ApiOkResponse({ type: Values })
  @ApiNotFoundResponse({ description: NOT_SAVED })
  @Get('values')
  getValues(@CurrentUser() userId: string): Promise<Values> {
    return this.sections.getValues(userId);
  }

  @ApiOperation({
    summary: 'Save screen 7, what matters to you (create or replace)',
  })
  @ApiOkResponse({ type: Values })
  @ApiBadRequestResponse({
    description: `${BAD_INPUT} Or fewer than 2 or more than 5 picks, a value picked twice, or a note longer than 300 characters.`,
  })
  @Put('values')
  upsertValues(
    @CurrentUser() userId: string,
    @Body() dto: UpsertValuesDto,
  ): Promise<Values> {
    return this.sections.upsertValues(userId, dto);
  }
}
