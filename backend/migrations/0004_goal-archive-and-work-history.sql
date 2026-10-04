-- Up Migration

-- A goal with work history is archived, not deleted (PROJECT.md §6.2).
-- NULL = active. The timestamp says when it was archived, the same idea as
-- steps.done_at.
ALTER TABLE goals
  ADD COLUMN archived_at TIMESTAMPTZ;

-- Work history must not disappear with a delete. Until now, deleting a goal
-- cascaded goal → tasks → steps → sessions. The last link loses its
-- ON DELETE CASCADE. With no action, PostgreSQL refuses to delete a step
-- that still has sessions (error 23503), and therefore also the task or
-- goal whose delete would cascade down to that step. The API answers 409.
--
-- No action (the default), not RESTRICT. Both refuse the delete above, and
-- both still let a whole user be deleted (that cascades to their steps AND
-- to their sessions; test/schema.e2e-spec.ts proves it). "No action" is
-- simply the default: a plain REFERENCES, nothing extra to remember.
-- SCHEMA.md §13.
ALTER TABLE sessions
  DROP CONSTRAINT sessions_step_id_fkey,
  ADD CONSTRAINT sessions_step_id_fkey
    FOREIGN KEY (step_id) REFERENCES steps(id);

-- Down Migration

ALTER TABLE sessions
  DROP CONSTRAINT sessions_step_id_fkey,
  ADD CONSTRAINT sessions_step_id_fkey
    FOREIGN KEY (step_id) REFERENCES steps(id) ON DELETE CASCADE;

ALTER TABLE goals
  DROP COLUMN archived_at;
