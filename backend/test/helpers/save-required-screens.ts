import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  ACHIEVEMENTS,
  CONFIDENCE,
  PATTERNS,
  SELF_VIEW,
  SITUATION,
  VALUES,
} from './onboarding-answers.js';

/** The required screens (2–7) with their route and example answers. */
export const REQUIRED_SCREEN_ANSWERS = [
  ['situation', SITUATION],
  ['achievements', ACHIEVEMENTS],
  ['patterns', PATTERNS],
  ['self-view', SELF_VIEW],
  ['confidence', CONFIDENCE],
  ['values', VALUES],
] as const;

/**
 * Saves screens 2–7 for the logged-in user. Onboarding is then complete:
 * GET /api/profile answers 200 and POST /api/goals is accepted. Basics is
 * optional and is not saved here.
 */
export async function saveRequiredScreens(
  app: INestApplication<App>,
  cookie: string,
): Promise<void> {
  for (const [path, answers] of REQUIRED_SCREEN_ANSWERS) {
    const response = await request(app.getHttpServer())
      .put(`/api/profile/sections/${path}`)
      .set('Cookie', cookie)
      .send(answers);
    if (response.status !== 200) {
      throw new Error(
        `Saving ${path} failed: ${String(response.status)} ${JSON.stringify(response.body)}`,
      );
    }
  }
}
