import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SUPPORTED_LOCALES } from '../locale.js';
// `import type`: a decorated class emits type metadata, and this is only a
// type (the array above is the runtime value).
import type { Locale } from '../locale.js';

export class RegisterDto {
  @ApiProperty({ example: 'you@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // The upper limit stops someone sending a huge password to keep the
  // server busy hashing it.
  @ApiProperty({
    example: 'correct horse battery',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  // An IANA name such as "Asia/Dubai", checked with Intl.DateTimeFormat.
  @ApiProperty({
    example: 'Asia/Dubai',
    description:
      'An IANA timezone name. Progress is counted per day in this timezone.',
  })
  @IsTimeZone()
  timezone!: string;

  // The language the app is showing when the person registers. Sent by
  // the browser, like the timezone; nobody types it.
  @ApiProperty({
    enum: SUPPORTED_LOCALES,
    example: 'en',
    description:
      'The language the app shows: `en` (English) or `ar` (Arabic). The AI advice is written in it.',
  })
  @IsIn(SUPPORTED_LOCALES)
  locale!: Locale;
}
