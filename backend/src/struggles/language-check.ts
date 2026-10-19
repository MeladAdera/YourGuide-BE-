import type { Locale } from '../auth/locale.js';

/**
 * Does a text read as the user's language? Counted on letters only: Arabic
 * script for `ar`, anything else for `en`. A rough test on purpose: the
 * advice is saved either way, and a mismatch is logged so we learn how
 * often the model slips (decided 2026-10-19).
 */
export function languageMatches(locale: Locale, text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) {
    return false;
  }
  const arabic = (letters.match(/[؀-ۿ]/g) ?? []).length;
  const share = arabic / letters.length;
  return locale === 'ar' ? share >= 0.5 : share < 0.5;
}
