// Must match the CHECK constraint on sessions.outcome in SCHEMA.md.
// The array exists at runtime (for DTO validation); the type is derived
// from it, so the two can never disagree.
export const SESSION_OUTCOMES = [
  'done',
  'progress',
  'stuck',
  'distracted',
  'tired',
] as const;
export type SessionOutcome = (typeof SESSION_OUTCOMES)[number];
