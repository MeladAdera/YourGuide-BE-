import { Injectable } from '@nestjs/common';
import { Executor } from '../../../database/database.service.js';
import { onlyRow } from '../../../database/only-row.js';
import {
  AgeRange,
  EducationLevel,
  EmploymentStatus,
  ExperienceRange,
} from './basics-options.js';
import { Basics } from './basics.dto.js';
import { UpsertBasicsDto } from './upsert-basics.dto.js';

/** One row of `profile_basics`, as PostgreSQL returns it. */
interface BasicsRow {
  employment_status: EmploymentStatus;
  age_range: AgeRange | null;
  country: string | null;
  education_level: EducationLevel | null;
  occupation: string | null;
  years_experience: ExperienceRange | null;
  updated_at: Date;
}

const COLUMNS =
  'employment_status, age_range, country, education_level, occupation, years_experience, updated_at';

@Injectable()
export class BasicsRepository {
  async findByUserId(
    executor: Executor,
    userId: string,
  ): Promise<Basics | undefined> {
    const { rows } = await executor.query<BasicsRow>(
      `SELECT ${COLUMNS} FROM profile_basics WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row === undefined ? undefined : toBasics(row);
  }

  /** Creates the screen the first time and replaces it after that. */
  async upsert(
    executor: Executor,
    userId: string,
    input: UpsertBasicsDto,
  ): Promise<Basics> {
    const { rows } = await executor.query<BasicsRow>(
      `INSERT INTO profile_basics (
         user_id, employment_status, age_range, country, education_level,
         occupation, years_experience
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE
         SET employment_status = EXCLUDED.employment_status,
             age_range = EXCLUDED.age_range,
             country = EXCLUDED.country,
             education_level = EXCLUDED.education_level,
             occupation = EXCLUDED.occupation,
             years_experience = EXCLUDED.years_experience,
             updated_at = now()
       RETURNING ${COLUMNS}`,
      [
        userId,
        input.employmentStatus,
        input.ageRange ?? null,
        input.country ?? null,
        input.educationLevel ?? null,
        input.occupation ?? null,
        input.yearsExperience ?? null,
      ],
    );
    return toBasics(onlyRow(rows, 'INSERT INTO profile_basics'));
  }
}

function toBasics(row: BasicsRow): Basics {
  return {
    employmentStatus: row.employment_status,
    ageRange: row.age_range,
    country: row.country,
    educationLevel: row.education_level,
    occupation: row.occupation,
    yearsExperience: row.years_experience,
    updatedAt: row.updated_at,
  };
}
