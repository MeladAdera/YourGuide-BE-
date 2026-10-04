-- Up Migration

-- The language the app shows this user: 'en' (English) or 'ar' (Arabic).
-- Sent by the browser at register, like the timezone, and changed with
-- PATCH /api/auth/me. The backend reads it in one place: the AI advice is
-- written in this language. SCHEMA.md §3.1, DECISIONS.md 2026-10-04.
--
-- The list must match SUPPORTED_LOCALES in src/auth/locale.ts.
--
-- The default exists for this one statement: it fills the users that are
-- already there with 'en', the only language the app had until now.
ALTER TABLE users
  ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'
    CHECK (locale IN ('en', 'ar'));

-- From here on the API always names the language, as it does the timezone.
-- With no default, an INSERT that forgets it fails instead of guessing.
ALTER TABLE users
  ALTER COLUMN locale DROP DEFAULT;

-- Down Migration

ALTER TABLE users
  DROP COLUMN locale;
