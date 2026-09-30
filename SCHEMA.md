# Your Guide — Database Schema v1

> **Change from the first draft:** `steps.done BOOLEAN` became `steps.done_at TIMESTAMPTZ` (section 8 and section 14). The reason is in `DECISIONS.md`.
>
> **Added later:** `users.timezone` (section 3.1), in migration `0002_add-user-timezone.sql`.
>
> **Migrations:** the files in `backend/migrations/` implement this document. The two must always match.

## 1. Purpose

This document defines the first database design for **Your Guide**.

The schema was derived from:

1.  Actors
2.  Entities
3.  Relationships
4.  Events
5.  Business rules

The goal is to understand **why** each table exists before implementing
the SQL migrations.

------------------------------------------------------------------------

# 2. Domain Overview

```text
User
 │
 ├──── Profile (1:1)
 │
 ├──── Auth Sessions (1:N)
 │
 └──── Goals (1:N)
          │
          └──── Tasks (1:N)
                   │
                   └──── Steps (1:N)
                            │
                            └──── Sessions (1:N)
                                      │
                                      └──── Struggles (0:N)
```

A struggle may also exist without a session.

```text
Struggle ── optional ──> Session
```

------------------------------------------------------------------------

# 3. Tables

## 3.1 users

Represents the person using the application.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email TEXT NOT NULL,

  password_hash TEXT NOT NULL,

  timezone TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unique
ON users (lower(email));
```

### Why does it exist?

The system needs to know who the user is and authenticate them.

### Main rules

-   Email is required.
-   Email is unique case-insensitively.
-   Store a password hash, never the raw password.
-   Timezone is required. It is an IANA name such as `Asia/Dubai`.

### Why `timezone`?

Progress is shown per day, and "day" must mean the user's day.

```text
A session at 01:30 on Tuesday in Dubai
is 21:30 on Monday in UTC.
```

Without the timezone, that session would be counted on the wrong day.
The API checks that the name is a real timezone before saving it.

------------------------------------------------------------------------

# 4. auth_sessions

Represents an authenticated browser session.

This is different from a focus/work session.

```sql
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
```

### Relationship

```text
User 1 ───── N Auth Sessions
```

A user can be logged in from multiple browsers/devices.

------------------------------------------------------------------------

# 5. profiles

Stores onboarding information about the user.

```sql
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  goal TEXT NOT NULL,

  why_it_matters TEXT NOT NULL,

  usual_blocker TEXT NOT NULL,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Relationship

```text
User 1 ───── 1 Profile
```

`user_id` is both the primary key and foreign key because each user has
one profile.

------------------------------------------------------------------------

# 6. goals

Represents a larger objective the user wants to achieve.

Example:

```text
Become a stronger full-stack developer
```

```sql
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
```

### Relationship

```text
User 1 ───── N Goals
```

### Rules

-   A goal belongs to exactly one user.
-   A user can have many goals.
-   Deleting the user deletes their goals.

------------------------------------------------------------------------

# 7. tasks

Represents a meaningful piece of work inside a goal.

Example:

```text
Goal:
Become a stronger full-stack developer

Tasks:
- Learn PostgreSQL
- Learn testing
- Build a backend project
```

```sql
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
```

### Relationship

```text
Goal 1 ───── N Tasks
```

### Rules

-   A task belongs to exactly one goal.
-   A goal can have many tasks.
-   A task belongs to one user.
-   Deleting a goal deletes its tasks.

------------------------------------------------------------------------

# 8. steps

Represents the smallest executable unit of work.

Example:

```text
Task:
Learn PostgreSQL

Steps:
1. Understand SELECT
2. Practice WHERE
3. Practice JOIN
4. Build a query
```

```sql
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

  done_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (task_id, position)
);

CREATE INDEX steps_user_idx
ON steps(user_id);

CREATE INDEX steps_task_idx
ON steps(task_id);
```

### Relationship

```text
Task 1 ───── N Steps
```

### Why `position`?

Steps need an explicit order.

```text
position 1 → Understand SELECT
position 2 → Practice WHERE
position 3 → Practice JOIN
```

The constraint:

```sql
UNIQUE (task_id, position)
```

prevents two steps belonging to the same task from having the same
position.

### Why `done_at` and not `done`?

```text
done_at IS NULL      → the step is not done
done_at IS NOT NULL  → the step is done, and we know when
```

The progress page shows steps completed **per day**. A boolean can say
that a step is done, but not on which day it was finished.

------------------------------------------------------------------------

# 9. sessions

Represents a period where the user actually works on a step.

Example:

```text
Step:
Implement login endpoint

Session 1 → 30 minutes → stuck
Session 2 → 45 minutes → progress
Session 3 → 25 minutes → done
```

```sql
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
```

### Relationship

```text
Step 1 ───── N Sessions
```

A step can be worked on across multiple focus sessions.

### Important business rule

A user can only have one active focus session.

An active session is one where:

```text
ended_at IS NULL
```

Database enforcement:

```sql
CREATE UNIQUE INDEX one_active_session_per_user
ON sessions(user_id)
WHERE ended_at IS NULL;
```

### Other rules

-   A session belongs to exactly one user.
-   A session belongs to exactly one step.
-   `ended_at` cannot be earlier than `started_at`.
-   Rating must be between 1 and 5.

------------------------------------------------------------------------

# 10. struggles

Represents a moment when the user reports that they are struggling.

This is one of the core concepts of Your Guide.

```sql
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
```

### Relationship

```text
User 1 ───── N Struggles

Session 1 ───── N Struggles
                 (optional)
```

### Why is `session_id` optional?

A user can struggle during a focus session:

```text
Focus Session
      ↓
"I'm struggling"
```

But they can also struggle outside a focus session:

```text
Dashboard
   ↓
"I'm struggling"
```

Therefore:

```text
session_id = nullable
```

### Stored information

A struggle records:

```text
situation
description
AI advice
recommended next step
whether the user continued
timestamp
```

This history becomes the initial "memory" of Your Guide.

------------------------------------------------------------------------

# 11. Complete Relationship Model

```text
                         ┌──────────┐
                         │  users   │
                         └────┬─────┘
                              │
              ┌───────────────┼────────────────┐
              │               │                │
              ▼               ▼                ▼
        ┌──────────┐   ┌─────────────┐   ┌─────────┐
        │ profiles │   │auth_sessions│   │  goals  │
        └──────────┘   └─────────────┘   └────┬────┘
                                              │
                                              ▼
                                         ┌─────────┐
                                         │  tasks  │
                                         └────┬────┘
                                              │
                                              ▼
                                         ┌─────────┐
                                         │  steps  │
                                         └────┬────┘
                                              │
                                              ▼
                                        ┌──────────┐
                                        │ sessions │
                                        └────┬─────┘
                                             │
                                             │ optional
                                             ▼
                                       ┌───────────┐
                                       │ struggles │
                                       └───────────┘
```

------------------------------------------------------------------------

# 12. Ownership

Every table containing user data has `user_id`.

Current ownership columns:

```text
goals.user_id
tasks.user_id
steps.user_id
sessions.user_id
struggles.user_id
```

This supports the application rule:

> Every repository method working with user data receives `userId`.

For example:

```sql
SELECT *
FROM tasks
WHERE id = $1
  AND user_id = $2;
```

If the task belongs to another user, it behaves as not found.

------------------------------------------------------------------------

# 13. Cascade Deletion Policy

For the current version, work history is considered part of the work
hierarchy.

Therefore:

```text
Delete Goal
    ↓
Delete Tasks
    ↓
Delete Steps
    ↓
Delete Sessions
```

And user deletion cascades through their data.

This means the database uses `ON DELETE CASCADE` for the work hierarchy.

For struggles:

```text
Delete Session
    ↓
Keep Struggle
    ↓
session_id becomes NULL
```

This is intentional because a struggle may still be useful as historical
information even if its session is deleted.

------------------------------------------------------------------------

# 14. Why there is no `progress` table

Progress is currently **derived data**, not an independent entity.

Examples:

```text
Focus minutes
    ↓
SUM(session duration)

Steps completed
    ↓
COUNT(steps WHERE done_at IS NOT NULL)

Struggles continued
    ↓
COUNT(struggles WHERE continued = true)
```

Therefore the progress page can calculate its data from:

```text
sessions
steps
struggles
```

No `progress` table is needed in v1.

------------------------------------------------------------------------

# 15. Why there is no `session_reviews` table

The session review is currently part of the session lifecycle.

The review consists of:

```text
outcome
note
rating
```

These values belong naturally to `sessions`.

Therefore:

```text
sessions
├── started_at
├── ended_at
├── outcome
├── note
└── rating
```

A separate `session_reviews` entity can be introduced later if the
domain requires it.

------------------------------------------------------------------------

# 16. Business Rules Summary

| Rule | Database mechanism |
|---|---|
| User email must be unique | Unique index |
| Goal belongs to one user | FK |
| Task belongs to one goal | FK |
| Step belongs to one task | FK |
| Session belongs to one step | FK |
| Struggle may optionally belong to a session | Nullable FK |
| Only one active session per user | Partial unique index |
| Session cannot end before it starts | CHECK constraint |
| Rating must be 1–5 | CHECK constraint |
| Step positions are unique within a task | UNIQUE constraint |
| Deleting a goal deletes its work hierarchy | ON DELETE CASCADE |
| Deleting a session keeps its struggle history | ON DELETE SET NULL |

------------------------------------------------------------------------

# 17. Simple Schema Review Method

Do **not** review the schema by reading every SQL line.

For every table, ask these five questions:

### 1. Why does this entity exist?

What real thing does it represent?

### 2. Who owns it?

Which user does this data belong to?

### 3. What does it belong to?

Does it have a parent entity?

### 4. What happens to it?

What events or state changes happen during its lifetime?

### 5. What must never happen?

What business rules should PostgreSQL enforce?

------------------------------------------------------------------------

# 18. Example Review — Sessions

Instead of saying:

> "sessions has 8 columns."

Review it like this:

### Why does it exist?

It represents a period where a user works on a specific step.

### Who owns it?

A user.

### What does it belong to?

A step.

### What happens to it?

```text
started
   ↓
active
   ↓
ended
   ↓
reviewed
```

### What must never happen?

```text
ended_at < started_at

two active sessions for the same user
```

Those rules are represented by database constraints.

------------------------------------------------------------------------

# 19. Current Design Decision

The current v1 model is:

```text
users
auth_sessions
profiles
goals
tasks
steps
sessions
struggles
```

No tables are currently needed for:

```text
progress
session_reviews
memory
```

because those concepts are currently represented by existing data or
derived through queries.

------------------------------------------------------------------------

# 20. Next Engineering Step

Before writing the migration files, review these three tables first:

```text
goals
tasks
steps
```

For each one, answer:

```text
1. What does it represent?
2. Who owns it?
3. What does it belong to?
4. What can happen to it?
5. What rules should the database enforce?
```

Then review:

```text
sessions
struggles
```

After the domain model is approved, convert it into actual
`node-pg-migrate` migration files.

**Status:** done. The model was approved on 2026-09-30 and the migration
is `backend/migrations/0001_initial.sql`.
