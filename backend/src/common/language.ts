import type { Locale } from '../auth/locale.js';

/** The share of a text's letters that are Arabic script, 0 to 1. */
function arabicShare(text: string): number | undefined {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) {
    return undefined;
  }
  return (letters.match(/[؀-ۿ]/g) ?? []).length / letters.length;
}

/**
 * Does a text read as the user's language? Counted on letters only: Arabic
 * script for `ar`, anything else for `en`. A rough test on purpose: the
 * advice is saved either way, and a mismatch is logged so we learn how
 * often the model slips (decided 2026-10-19).
 */
export function languageMatches(locale: Locale, text: string): boolean {
  const share = arabicShare(text);
  if (share === undefined) {
    return false;
  }
  return locale === 'ar' ? share >= 0.5 : share < 0.5;
}

/**
 * The language a text is written in, by its letters. Any Arabic letter
 * makes it `ar`: English writers never type Arabic script, while Arabic
 * writers often keep a Latin product name ("تعلم PostgreSQL"). Otherwise
 * two or more Latin letters make it `en`. Anything else (digits, another
 * script, nothing) is the fallback. Used for the steps the model suggests
 * for a task: they sit next to the task's title, so they follow its
 * language (YOU-28), and the account's language when the title does not say.
 */
export function localeOfText(text: string, fallback: Locale): Locale {
  if (/[\u0600-\u06FF]/.test(text)) {
    return 'ar';
  }
  const latin = (text.match(/[A-Za-z\u00C0-\u024F]/g) ?? []).length;
  return latin >= 2 ? 'en' : fallback;
}
