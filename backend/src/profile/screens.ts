/**
 * The onboarding screens before the direction (screen 8), in the order
 * the wizard shows them. The names are the keys of `sections` in the
 * profile and of `screens` in the onboarding status.
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
 * Screens 2–7 must be saved before the direction is accepted. Basics is
 * the one optional screen: it helps advice fit, but nothing depends on it.
 * This is the product rule "the goal comes after the reflection"
 * (DECISIONS.md, 2026-10-03), and it lives here, in the backend.
 */
export const REQUIRED_SCREENS: readonly Screen[] = SCREENS.filter(
  (screen) => screen !== 'basics',
);
