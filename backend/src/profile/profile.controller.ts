import { Controller, Get } from '@nestjs/common';
import {
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
import { ProfileService } from './profile.service.js';

// Reading only. The profile is written one screen at a time, through
// PUT /profile/sections/<screen> (SectionsController). There is no
// PUT /profile: what it used to save, the direction, is a goal now.
//
// No @Public() anywhere here: every route needs a login. The decorators on
// the class apply to every route in it.
@ApiTags('profile')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in.' })
@Controller('profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @ApiOperation({ summary: 'Your whole profile: the seven onboarding screens' })
  @ApiOkResponse({ type: Profile })
  @ApiNotFoundResponse({
    description:
      'Onboarding is not done yet: a required screen (2–7) is not saved.',
  })
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
}
