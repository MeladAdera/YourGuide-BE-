import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO31661Alpha2, IsOptional } from 'class-validator';
import { Answer, MAX_SHORT_ANSWER } from '../../../common/answer.decorator.js';
import {
  AGE_RANGES,
  EDUCATION_LEVELS,
  EMPLOYMENT_STATUSES,
  EXPERIENCE_RANGES,
} from './basics-options.js';
// `import type`: decorated classes emit type metadata, and these are only
// types (the arrays above are the runtime values).
import type {
  AgeRange,
  EducationLevel,
  EmploymentStatus,
  ExperienceRange,
} from './basics-options.js';

/**
 * Screen 1, basics. Only the employment status is required; the screen
 * exists so advice fits the person's situation, not to identify them.
 */
export class UpsertBasicsDto {
  @ApiProperty({ enum: EMPLOYMENT_STATUSES, example: 'employed' })
  @IsIn(EMPLOYMENT_STATUSES)
  employmentStatus!: EmploymentStatus;

  @ApiPropertyOptional({ enum: AGE_RANGES, example: '25_34', nullable: true })
  @IsOptional()
  @IsIn(AGE_RANGES)
  ageRange?: AgeRange | null;

  @ApiPropertyOptional({
    type: String,
    example: 'AE',
    description:
      'ISO 3166-1 alpha-2 country code. Country only, never a city or address.',
    nullable: true,
  })
  @IsOptional()
  @IsISO31661Alpha2()
  country?: string | null;

  @ApiPropertyOptional({
    enum: EDUCATION_LEVELS,
    example: 'bachelor',
    nullable: true,
  })
  @IsOptional()
  @IsIn(EDUCATION_LEVELS)
  educationLevel?: EducationLevel | null;

  @Answer({
    example: 'Full-stack developer at a small startup',
    description: 'What do you do now, in your words?',
    max: MAX_SHORT_ANSWER,
    optional: true,
  })
  occupation?: string | null;

  @ApiPropertyOptional({
    enum: EXPERIENCE_RANGES,
    example: '2_5',
    nullable: true,
  })
  @IsOptional()
  @IsIn(EXPERIENCE_RANGES)
  yearsExperience?: ExperienceRange | null;
}
