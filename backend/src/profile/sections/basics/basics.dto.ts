import { ApiProperty } from '@nestjs/swagger';
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

/** Screen 1 as the API returns it. Optional answers left out are null. */
export class Basics {
  @ApiProperty({ enum: EMPLOYMENT_STATUSES })
  employmentStatus!: EmploymentStatus;

  @ApiProperty({ enum: AGE_RANGES, nullable: true, type: String })
  ageRange!: AgeRange | null;

  @ApiProperty({ example: 'AE', nullable: true, type: String })
  country!: string | null;

  @ApiProperty({ enum: EDUCATION_LEVELS, nullable: true, type: String })
  educationLevel!: EducationLevel | null;

  @ApiProperty({ nullable: true, type: String })
  occupation!: string | null;

  @ApiProperty({ enum: EXPERIENCE_RANGES, nullable: true, type: String })
  yearsExperience!: ExperienceRange | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
