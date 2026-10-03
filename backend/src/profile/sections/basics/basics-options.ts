// Must match the CHECK constraints on profile_basics in SCHEMA.md §5.1.
// The arrays exist at runtime (for DTO validation and Swagger); the types
// are derived from them, so the two can never disagree.

export const EMPLOYMENT_STATUSES = [
  'student',
  'employed',
  'self_employed',
  'between_jobs',
  'caregiver',
  'retired',
  'other',
] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const AGE_RANGES = [
  'under_18',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_plus',
] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export const EDUCATION_LEVELS = [
  'secondary',
  'vocational',
  'bachelor',
  'master',
  'doctorate',
  'other',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EXPERIENCE_RANGES = [
  'none',
  'under_2',
  '2_5',
  '6_10',
  'over_10',
] as const;
export type ExperienceRange = (typeof EXPERIENCE_RANGES)[number];
