import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { OnboardingStatus } from './dto/onboarding-status.dto.js';
import { Profile } from './dto/profile.dto.js';
import { UpsertProfileDto } from './dto/upsert-profile.dto.js';
import { ProfileService } from './profile.service.js';

// No @Public() anywhere here: every route needs a login. The decorators on
// the class apply to every route in it.
@ApiTags('profile')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller('profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @ApiOperation({
    summary: 'Your whole profile: the direction and every saved screen',
  })
  @ApiOkResponse({ type: Profile })
  @ApiNotFoundResponse({ description: 'Onboarding is not done yet.' })
  @Get()
  get(@CurrentUser() userId: string): Promise<Profile> {
    return this.profiles.get(userId);
  }

  @ApiOperation({ summary: 'Where you are in onboarding (never 404)' })
  @ApiOkResponse({ type: OnboardingStatus })
  @Get('onboarding')
  status(@CurrentUser() userId: string): Promise<OnboardingStatus> {
    return this.profiles.status(userId);
  }

  // PUT, not POST: there is one profile per user and the client always sends
  // the whole thing. The same call creates it the first time and replaces it
  // after that, so the client never has to ask "did I onboard already?".
  @ApiOperation({
    summary:
      'Save screen 8, your direction (create or replace). Completes onboarding.',
  })
  @ApiOkResponse({ type: Profile })
  @ApiBadRequestResponse({
    description:
      'A missing or empty answer, an answer that is too long, or an unknown field.',
  })
  @ApiConflictResponse({
    description:
      'Screens 2–7 are not all saved yet. The body lists them under `missing`.',
  })
  @Put()
  upsert(
    @CurrentUser() userId: string,
    @Body() dto: UpsertProfileDto,
  ): Promise<Profile> {
    return this.profiles.upsert(userId, dto);
  }
}
