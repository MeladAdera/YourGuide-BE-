// Must match the CHECK constraint on profile_values.value in SCHEMA.md §5.8.
// The array exists at runtime (for DTO validation and Swagger); the type is
// derived from it, so the two can never disagree.
export const LIFE_VALUES = [
  'family',
  'health',
  'career',
  'learning',
  'contribution',
  'financial_security',
  'creativity',
  'relationships',
  'spirituality',
  'independence',
] as const;
export type LifeValue = (typeof LIFE_VALUES)[number];

/** A user picks at least this many values... */
export const MIN_VALUES = 2;
/** ...and at most this many. Five is enough to say what matters; more says nothing. */
export const MAX_VALUES = 5;
