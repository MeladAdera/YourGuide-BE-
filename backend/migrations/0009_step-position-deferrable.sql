-- Up Migration

-- Reordering the steps of a task changes several positions in one UPDATE:
-- step 1 goes to place 3, step 3 to place 1. A plain UNIQUE constraint is
-- checked row by row, so the first row that moves collides with the row
-- still standing in its new place, and the whole UPDATE fails.
--
-- DEFERRABLE makes PostgreSQL check once the statement has finished, when
-- every row has its new position. INITIALLY IMMEDIATE keeps "finished"
-- meaning the end of each statement, not the end of the transaction, so a
-- real duplicate is still reported by the statement that caused it.
--
-- The plain constraint and both deferrable variants were tried against
-- PostgreSQL 16 before writing this. SCHEMA.md §8, DECISIONS.md 2026-10-05.
ALTER TABLE steps
  DROP CONSTRAINT steps_task_id_position_key,
  ADD CONSTRAINT steps_task_id_position_key
    UNIQUE (task_id, position) DEFERRABLE INITIALLY IMMEDIATE;

-- Down Migration

ALTER TABLE steps
  DROP CONSTRAINT steps_task_id_position_key,
  ADD CONSTRAINT steps_task_id_position_key
    UNIQUE (task_id, position);
