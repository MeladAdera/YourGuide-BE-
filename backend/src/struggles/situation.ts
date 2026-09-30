// Must match the CHECK constraint on struggles.situation in SCHEMA.md.
// The array exists at runtime (for DTO validation); the type is derived
// from it, so the two can never disagree.
export const SITUATIONS = [
  'stuck',
  'tired',
  'comparing',
  'negative_thought',
] as const;
export type Situation = (typeof SITUATIONS)[number];
