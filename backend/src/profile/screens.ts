/**
 * The onboarding screens, in the order the wizard shows them. The names are
 * the keys of the profile and of `screens` in the onboarding status.
 */
export const SCREENS = [
  'basics',
  'situation',
  'achievements',
  'patterns',
  'selfView',
  'confidence',
  'values',
] as const;
export type Screen = (typeof SCREENS)[number];

/**
 * Onboarding is complete when these six are saved. Basics is the one
 * optional screen: it helps advice fit, but nothing depends on it.
 *
 * A goal cannot be created before them. This is the product rule "the goal
 * comes after the reflection" (DECISIONS.md, 2026-10-03 and 2026-10-04),
 * and it lives here, in the backend.
 */
export const REQUIRED_SCREENS: readonly Screen[] = SCREENS.filter(
  (screen) => screen !== 'basics',
);
