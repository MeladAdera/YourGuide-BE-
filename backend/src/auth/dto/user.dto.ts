import { ApiProperty } from '@nestjs/swagger';
import { SUPPORTED_LOCALES } from '../locale.js';
import type { Locale } from '../locale.js';

/**
 * A user as the API returns it. Never includes the password hash.
 * A class, not an interface, so Swagger can describe the response;
 * the repositories use it as a plain type.
 */
export class User {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'you@example.com' })
  email!: string;

  @ApiProperty({ example: 'Asia/Dubai', description: 'An IANA timezone name.' })
  timezone!: string;

  @ApiProperty({
    enum: SUPPORTED_LOCALES,
    example: 'en',
    description: 'The language the app shows this user.',
  })
  locale!: Locale;
}
