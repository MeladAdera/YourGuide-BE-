-- Up Migration

-- The review (outcome, note, rating) is what a person says about a session
-- once it is over. A session that is still running has no outcome yet, so
-- a row with ended_at empty and a review filled in is a contradiction.
--
-- The API cannot write one: ending a session sets ended_at and the review
-- in a single UPDATE. This constraint says the same thing in the database,
-- where it also holds for a row changed by hand.
--
-- Only this direction. "An ended session always has a review" is not
-- stated: a session may one day be closed without one (left running
-- overnight, started by mistake). SCHEMA.md §9, DECISIONS.md 2026-10-06.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_review_only_when_ended
    CHECK (
      ended_at IS NOT NULL
      OR (outcome IS NULL AND note IS NULL AND rating IS NULL)
    );

-- Down Migration

ALTER TABLE sessions
  DROP CONSTRAINT sessions_review_only_when_ended;
