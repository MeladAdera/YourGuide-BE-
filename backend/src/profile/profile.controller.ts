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
import { CurrentUser } from '../auth/current-user.decorator.js';
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

  @ApiOperation({ summary: 'Your onboarding answers' })
  @ApiOkResponse({ type: Profile })
  @ApiNotFoundResponse({ description: 'Onboarding is not done yet.' })
  @Get()
  get(@CurrentUser() userId: string): Promise<Profile> {
    return this.profiles.get(userId);
  }

  // PUT, not POST: there is one profile per user and the client always sends
  // the whole thing. The same call creates it the first time and replaces it
  // after that, so the client never has to ask "did I onboard already?".
  @ApiOperation({ summary: 'Save your onboarding answers (create or replace)' })
  @ApiOkResponse({ type: Profile })
  @ApiBadRequestResponse({
    description: 'A missing or empty answer, or an unknown field.',
  })
  @Put()
  upsert(
    @CurrentUser() userId: string,
    @Body() dto: UpsertProfileDto,
  ): Promise<Profile> {
    return this.profiles.upsert(userId, dto);
  }
}
