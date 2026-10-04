import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import { SUPPORTED_LOCALES } from '../locale.js';
// `import type`: a decorated class emits type metadata, and this is only a
// type (the array above is the runtime value).
import type { Locale } from '../locale.js';

/**
 * PATCH /auth/me changes only what is sent, like PATCH on a goal. Today
 * the one thing a user can change about their account is the language.
 */
export class UpdateMeDto {
  // Not @IsOptional(): that would accept `null` and silently ignore it.
  // The field may be left out; if it is sent, it must be a real language.
  @ApiPropertyOptional({
    enum: SUPPORTED_LOCALES,
    example: 'ar',
    description: 'The language the app shows: `en` (English) or `ar` (Arabic).',
  })
  @ValidateIf((_user: unknown, value: unknown) => value !== undefined)
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;
}
