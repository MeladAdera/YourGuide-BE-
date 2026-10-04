-- Up Migration

-- Onboarding screen 8 ("your direction") was a second home for a goal: a
-- title, why it matters, what gets in the way, the first outcome. Goals
-- carry all of that since 0005, so the direction moves to where it belongs
-- and the profiles table goes away. The profile is the seven profile_*
-- screens about the person. SCHEMA.md §5, DECISIONS.md 2026-10-04.

-- Every saved direction becomes a goal, so nothing that was typed is lost.
-- Skipped when that user already has a goal with the same title. A goal
-- title is at most 200 characters in the API; the old column allowed more.
INSERT INTO goals (
  user_id, title, why_it_matters, obstacle, first_outcome, created_at
)
SELECT p.user_id,
       left(p.goal, 200),
       p.why_it_matters,
       p.usual_blocker,
       p.first_outcome,
       p.completed_at
  FROM profiles p
 WHERE NOT EXISTS (
         SELECT 1
           FROM goals g
          WHERE g.user_id = p.user_id
            AND g.title = left(p.goal, 200)
       );

DROP TABLE profiles;

-- Down Migration

-- The table comes back empty. Which goal used to be "the direction" is no
-- longer recorded, so its rows cannot be restored.
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  goal TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  usual_blocker TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_outcome TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
