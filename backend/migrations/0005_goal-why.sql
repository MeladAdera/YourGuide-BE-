-- Up Migration

-- A goal carries its own why. Until now the why lived on the profile (the
-- old onboarding screen 8), so only one aim had a why and every other goal
-- had none. The same goes for the obstacle and the first outcome: they
-- describe a goal, not the person. SCHEMA.md §6, DECISIONS.md 2026-10-04.
ALTER TABLE goals
  ADD COLUMN why_it_matters TEXT,
  ADD COLUMN obstacle TEXT,
  ADD COLUMN first_outcome TEXT;

-- Goals that already exist take the why their owner wrote on the profile.
-- There are no real users yet: the placeholder can only land on rows in a
-- developer's own database, for a goal created before this migration by
-- someone who had not saved the profile.
UPDATE goals g
   SET why_it_matters = COALESCE(
         (SELECT p.why_it_matters FROM profiles p WHERE p.user_id = g.user_id),
         'Not written yet.'
       );

ALTER TABLE goals
  ALTER COLUMN why_it_matters SET NOT NULL;

-- Down Migration

ALTER TABLE goals
  DROP COLUMN first_outcome,
  DROP COLUMN obstacle,
  DROP COLUMN why_it_matters;
