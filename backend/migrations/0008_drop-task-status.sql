-- Up Migration

-- A task's status is read from its steps, never stored (PROJECT.md §6.2:
-- "a task is done automatically when all its steps are done"):
--
--   no step done (or no steps yet)   todo
--   some steps done, not all         in_progress
--   every step done                  done
--
-- A stored status would be a second copy of what the steps already say,
-- and the two could disagree: every step done, the column still 'todo'.
-- SCHEMA.md §7 has the query, DECISIONS.md 2026-10-05 the reasons.
--
-- Nothing is lost: no code ever wrote this column, so every row held the
-- default. Its CHECK constraint goes with it.
ALTER TABLE tasks
  DROP COLUMN status;

-- Down Migration

ALTER TABLE tasks
  ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done'));
