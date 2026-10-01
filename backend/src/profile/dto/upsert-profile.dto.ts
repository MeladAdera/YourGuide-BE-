import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

// The limit is generous: these are a few sentences, not essays. It exists so
// nobody can store megabytes in a text column.
const MAX = 1000;

/** The onboarding answers. PUT sends all three, every time. */
export class UpsertProfileDto {
  @ApiProperty({
    example: 'Become a stronger full-stack developer',
    maxLength: MAX,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX)
  goal!: string;

  @ApiProperty({
    example: 'I want to build my own products without waiting for anyone.',
    maxLength: MAX,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX)
  whyItMatters!: string;

  @ApiProperty({
    example: 'I open the editor, feel lost, and switch to something easier.',
    maxLength: MAX,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX)
  usualBlocker!: string;
}
