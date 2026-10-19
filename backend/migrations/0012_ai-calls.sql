-- Up Migration

-- One row per call to the language model that answered, for the daily
-- limit per user (AI_DAILY_LIMIT). Struggles are stored, so they could be
-- counted from their own table; a task breakdown is returned and not
-- saved, so it could not. One table counts every kind the same way.
-- Nothing of the prompt or the answer is here: who, what kind, when.
CREATE TABLE ai_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('struggle', 'breakdown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The count of today's calls for one user.
CREATE INDEX ai_calls_user_created_idx
ON ai_calls(user_id, created_at);

-- Down Migration

DROP TABLE ai_calls;
