-- Up Migration

-- The full design and the reason for every table live in SCHEMA.md.
-- This file must match it.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unique
ON users (lower(email));

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_sessions_user_idx
ON auth_sessions(user_id);

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,
  goal TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  usual_blocker TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX goals_user_idx
ON goals(user_id);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  goal_id UUID NOT NULL
    REFERENCES goals(id)
    ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (
      status IN ('todo', 'in_progress', 'done')
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tasks_user_idx
ON tasks(user_id);

CREATE INDEX tasks_goal_idx
ON tasks(goal_id);

CREATE TABLE steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  task_id UUID NOT NULL
    REFERENCES tasks(id)
    ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INT NOT NULL,
  -- NULL = not done. The timestamp gives "steps completed per day".
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, position)
);

CREATE INDEX steps_user_idx
ON steps(user_id);

CREATE INDEX steps_task_idx
ON steps(task_id);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  step_id UUID NOT NULL
    REFERENCES steps(id)
    ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  outcome TEXT
    CHECK (
      outcome IN (
        'done',
        'progress',
        'stuck',
        'distracted',
        'tired'
      )
    ),
  note TEXT,
  rating SMALLINT
    CHECK (rating BETWEEN 1 AND 5),
  CHECK (
    ended_at IS NULL
    OR ended_at > started_at
  )
);

CREATE INDEX sessions_user_started_idx
ON sessions(user_id, started_at);

CREATE INDEX sessions_step_idx
ON sessions(step_id);

-- A user can have only one active (not ended) focus session.
CREATE UNIQUE INDEX one_active_session_per_user
ON sessions(user_id)
WHERE ended_at IS NULL;

CREATE TABLE struggles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,
  session_id UUID
    REFERENCES sessions(id)
    ON DELETE SET NULL,
  situation TEXT NOT NULL
    CHECK (
      situation IN (
        'stuck',
        'tired',
        'comparing',
        'negative_thought'
      )
    ),
  description TEXT NOT NULL,
  advice TEXT NOT NULL,
  next_step TEXT NOT NULL,
  continued BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX struggles_user_created_idx
ON struggles(user_id, created_at);

CREATE INDEX struggles_session_idx
ON struggles(session_id);

-- Down Migration

DROP TABLE struggles;
DROP TABLE sessions;
DROP TABLE steps;
DROP TABLE tasks;
DROP TABLE goals;
DROP TABLE profiles;
DROP TABLE auth_sessions;
DROP TABLE users;
