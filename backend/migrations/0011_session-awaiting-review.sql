-- Up Migration

-- A session has three states: running (the clock counts), awaiting review
-- (the clock has stopped, the review is still owed) and completed. The
-- first two are "active": while one exists, no other session starts.
--
-- Until now "active" meant ended_at IS NULL. A session whose clock was
-- stopped without a review would then have let a new one start, with the
-- review still owed. So the index now covers every session that has no
-- outcome yet: not reviewed, whether or not the clock still runs.
--
-- Same name as before: the code catches the refusal by that name.
DROP INDEX one_active_session_per_user;
CREATE UNIQUE INDEX one_active_session_per_user
  ON sessions(user_id)
  WHERE outcome IS NULL;

-- A review is an outcome and a rating together, or nothing yet. Without
-- this, a row with one of the two would be neither awaiting review nor
-- completed. The note stays optional.
ALTER TABLE sessions
  ADD CONSTRAINT sessions_review_complete
    CHECK ((outcome IS NULL) = (rating IS NULL));

-- Down Migration

ALTER TABLE sessions
  DROP CONSTRAINT sessions_review_complete;

DROP INDEX one_active_session_per_user;
CREATE UNIQUE INDEX one_active_session_per_user
  ON sessions(user_id)
  WHERE ended_at IS NULL;
