// The languages the app can show. Must match the CHECK constraint on
// users.locale in SCHEMA.md §3.1. The array exists at runtime (for DTO
// validation and Swagger); the type is derived from it, so the two can
// never disagree.
//
// The backend itself translates nothing: the frontend owns the wording in
// each language. The backend stores the choice because the AI advice is
// written in it, and so that it follows the user to another browser.
export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
