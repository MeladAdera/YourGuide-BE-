# Your Guide — Database Schema v1

> **Change from the first draft:** `steps.done BOOLEAN` became `steps.done_at TIMESTAMPTZ` (section 8 and section 14). The reason is in `DECISIONS.md`.
>
> **Added later:** `users.timezone` (section 3.1), in migration `0002_add-user-timezone.sql`.
>
> **Added 2026-10-03:** the onboarding screen tables (sections 5.1–5.8) and `profiles.first_outcome`, `profiles.completed_at`, in migration `0003_onboarding-sections.sql`.
>
> **Changed 2026-10-04:** `goals.archived_at` (section 6), and `sessions.step_id` no longer cascades, so work history cannot be deleted (sections 9 and 13), in migration `0004_goal-archive-and-work-history.sql`.
>
> **Changed 2026-10-04 (2):** a goal carries `why_it_matters`, `obstacle` and `first_outcome` (migration `0005_goal-why.sql`). The `profiles` table is gone: its rows became goals (migration `0006_direction-into-goals.sql`). Sections 5 and 6.
>
> **Added 2026-10-04 (3):** `users.locale` (section 3.1), the language the app shows the user, in migration `0007_add-user-locale.sql`.
>
> **Changed 2026-10-05:** `tasks.status` is gone. A task's status is read from its steps (section 7), in migration `0008_drop-task-status.sql`.
>
> **Changed 2026-10-05 (2):** the unique constraint on a step's position is deferrable, so the steps of a task can be reordered in one statement (section 8), in migration `0009_step-position-deferrable.sql`.
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
 ├──── Profile screens (1:1 each)   the seven onboarding screens, one table each
 ├──── Profile values (1:N)         the picks on screen 7
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

  locale TEXT NOT NULL
    CHECK (locale IN ('en', 'ar')),

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
-   Locale is required. It is `en` (English) or `ar` (Arabic), with no
    default: the API always names it.

### Why `timezone`?

Progress is shown per day, and "day" must mean the user's day.

```text
A session at 01:30 on Tuesday in Dubai
is 21:30 on Monday in UTC.
```

Without the timezone, that session would be counted on the wrong day.
The API checks that the name is a real timezone before saving it.

### Why `locale`?

The app is shown in English or Arabic, and the frontend does the
translating. The database stores no translated text: it holds codes
(`family`, `stuck`) and what the user wrote.

The backend still needs to know the user's language, for one reason: the
AI advice is the only text the backend writes for a person, and it must
be written in the language that person reads. Stored on the account, the
choice also follows the user to another browser.

This is the display language of the app, a setting. It is not "the
languages a person speaks", which the profile deliberately does not ask
(section 5.1): no feature reads that.

The list is a CHECK constraint, like every other option list. A third
language is a migration, one entry in `SUPPORTED_LOCALES`, and one
translation file in the frontend.

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

# 5. The profile: the onboarding screens

The profile is what the app knows about the **person**: who they are,
where they are now, what matters to them. It is seven screens, in this
order, and each screen is its own table:

```text
1  Basics                 profile_basics        optional screen
2  Your days now          profile_situation     required
3  What you have done     profile_achievements  required
4  What gets in the way   profile_patterns      required
5  How you see yourself   profile_self_view     required
6  Quick check-in         profile_confidence    required
7  What matters to you    profile_meaning       required
                          profile_values        the picks, 2–5 rows
```

Onboarding is complete when the six required screens are saved. Then the
wizard asks for the first **goal**, and that is an ordinary row in
`goals` (section 6): where the person wants to go, why it matters, what
might get in the way, the first outcome. The API refuses to create a
goal before the six screens exist.

The goal comes last on purpose: after a person has recalled what they
can do, named what they avoid and chosen what matters, the goal they
write is more specific and more their own. `PROJECT.md` §6.1 has the
screens; `DECISIONS.md` (2026-10-03 and 2026-10-04) has the reasoning.

### Why is there no `profiles` table?

There was one until 2026-10-04. It held "screen 8, your direction": a
goal, why it matters, the usual blocker, the first outcome. Every one of
those describes a goal, not the person, and the `goals` table already
existed. A user who had saved the seven screens and created a goal was
then asked to type the same things again. Migration `0006` turned every
saved direction into a goal and dropped the table.

"Onboarding complete" needs no row of its own either. It is "the six
required screen rows exist", answered by one query.

### Why one table per screen?

-   A screen can be saved on its own, so nobody loses answers by leaving
    half-way through.
-   "Required on this screen" is `NOT NULL`. In one wide table every
    column would have to be nullable and the rule would live only in
    code.
-   "This screen is done" is "this row exists". No status columns.
-   Each table is small enough to read in one look.

The cost is eight tables that look alike, and a full profile read that
touches all of them.

Rejected: one wide `profiles` table with about forty nullable columns;
a generic `profile_answers (question_key, answer)` table; and one JSONB
column per screen. The last two take every rule out of the database.

### The shape every screen table shares

```text
user_id     primary key AND foreign key → one row per user, deleted with the user
...         the answers of that screen
updated_at  when the screen was last saved
```

### What must never happen

-   A confidence answer outside 1–5 (`CHECK`).
-   An option outside its list, for example an unknown employment status
    (`CHECK`).
-   The same value picked twice by one user (primary key).
-   A diagnosis derived from any of these rows. That is an application
    rule, not a constraint: the app never states or stores one.

## 5.1 profile_basics — screen 1, basics

```sql
CREATE TABLE profile_basics (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  employment_status TEXT NOT NULL
    CHECK (
      employment_status IN (
        'student',
        'employed',
        'self_employed',
        'between_jobs',
        'caregiver',
        'retired',
        'other'
      )
    ),

  age_range TEXT
    CHECK (
      age_range IN (
        'under_18',
        '18_24',
        '25_34',
        '35_44',
        '45_54',
        '55_plus'
      )
    ),

  -- ISO 3166-1 alpha-2, e.g. 'AE'. Country only, never a city or address.
  country TEXT
    CHECK (country ~ '^[A-Z]{2}$'),

  education_level TEXT
    CHECK (
      education_level IN (
        'secondary',
        'vocational',
        'bachelor',
        'master',
        'doctorate',
        'other'
      )
    ),

  -- "What do you do now, in your words?"
  occupation TEXT,

  years_experience TEXT
    CHECK (
      years_experience IN (
        'none',
        'under_2',
        '2_5',
        '6_10',
        'over_10'
      )
    ),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Why does it exist?

Quick facts so advice fits the person's situation: a student and a
parent working full time need different advice. Only the employment
status is required; the rest can be skipped.

### What is deliberately not here

City, address, birthdate, languages, field of study, gender, health.
No feature reads them. Age is a range and location is a country for the
same reason: the app needs context, not identification.

## 5.2 profile_situation — screen 2, your days now

```sql
CREATE TABLE profile_situation (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  -- "What does your typical day look like?"
  typical_day TEXT NOT NULL,

  -- "What would you most like to change?"
  want_to_change TEXT NOT NULL,

  -- "What part of your life are you satisfied with?"
  satisfied_with TEXT,

  -- "What do you wish you had more time for?"
  wish_more_time_for TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Why does it exist?

"Where am I now?" An honest look at how the days are actually spent,
before any talk of goals.

## 5.3 profile_achievements — screen 3, what you have done

```sql
CREATE TABLE profile_achievements (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  -- "Something you achieved, got through, or surprised yourself with."
  proud_of TEXT NOT NULL,

  -- "What was difficult about it?"
  what_was_hard TEXT,

  -- "What did you learn about yourself from it?"
  learned_about_self TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Why does it exist?

Evidence of what the person can do. When they later press "I'm
struggling", the advice can point at their own track record instead of
at a slogan.

## 5.4 profile_patterns — screen 4, what gets in the way

```sql
CREATE TABLE profile_patterns (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  -- "What do you keep postponing or avoiding?"
  often_postpone TEXT NOT NULL,

  -- "A mistake or regret that taught you something."
  lesson_from_mistake TEXT,

  -- "A habit or pattern you would like to change."
  pattern_to_change TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Why does it exist?

"What is stopping me?" Patterns the person already knows about, in
their own words. The wording is about habits and lessons, never about
what is wrong with them; the optional questions are the more personal
ones.

## 5.5 profile_self_view — screen 5, how you see yourself

```sql
CREATE TABLE profile_self_view (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  -- "Describe yourself honestly. Who are you at this point in your life?"
  who_i_am TEXT NOT NULL,

  -- "What are you naturally good at?"
  good_at TEXT,

  -- "What do other people usually come to you for?"
  others_come_to_me_for TEXT,

  -- "What are you still trying to understand about yourself?"
  still_figuring_out TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Why does it exist?

"Who am I?" It comes after screens 3 and 4 on purpose: people describe
themselves far better once they have just recalled concrete
achievements and patterns.

## 5.6 profile_confidence — screen 6, quick check-in

```sql
CREATE TABLE profile_confidence (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  -- Eight statements, each answered 1 (strongly disagree) to 5 (strongly agree).
  can_learn_if_persist      SMALLINT NOT NULL CHECK (can_learn_if_persist BETWEEN 1 AND 5),
  can_try_again             SMALLINT NOT NULL CHECK (can_try_again BETWEEN 1 AND 5),
  follow_through            SMALLINT NOT NULL CHECK (follow_through BETWEEN 1 AND 5),
  focus_without_motivation  SMALLINT NOT NULL CHECK (focus_without_motivation BETWEEN 1 AND 5),
  actions_shape_future      SMALLINT NOT NULL CHECK (actions_shape_future BETWEEN 1 AND 5),
  doubt_despite_evidence    SMALLINT NOT NULL CHECK (doubt_despite_evidence BETWEEN 1 AND 5),
  avoid_when_afraid         SMALLINT NOT NULL CHECK (avoid_when_afraid BETWEEN 1 AND 5),
  compare_too_much          SMALLINT NOT NULL CHECK (compare_too_much BETWEEN 1 AND 5),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The statements, in the same order:

```text
can_learn_if_persist      I can learn difficult things if I keep at them.
can_try_again             When I fail, I can usually try again.
follow_through            I usually follow through on commitments I make to myself.
focus_without_motivation  I can stay focused on something important even when I do not feel motivated.
actions_shape_future      My actions can significantly improve my future.
doubt_despite_evidence    I often doubt my ability even when I have evidence that I can succeed.
avoid_when_afraid         I avoid difficult situations because I am afraid of failing.
compare_too_much          I compare myself with other people too much.
```

### Why does it exist?

Signals for personalisation. The last three map directly to the
struggle situations `negative_thought`, `stuck` and `comparing`.

### What must never happen

There is **no total, no score and no label**. The eight answers are
stored as they were given. A single number called "self-efficacy" is
the first step towards a diagnosis, and the app never makes one.

## 5.7 profile_meaning — screen 7, what matters to you

```sql
CREATE TABLE profile_meaning (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  -- "What kind of person do you want to become?"
  person_to_become TEXT NOT NULL,

  -- "What would you regret not doing?"
  would_regret_not_doing TEXT,

  -- "What do you want people to remember about you?"
  remembered_for TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Why does it exist?

"What matters to me?" The answers here are half of the "why" behind the
first goal.

## 5.8 profile_values — screen 7, the picks

```sql
CREATE TABLE profile_values (
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  value TEXT NOT NULL
    CHECK (
      value IN (
        'family',
        'health',
        'career',
        'learning',
        'contribution',
        'financial_security',
        'creativity',
        'relationships',
        'spirituality',
        'independence'
      )
    ),

  -- Optional: why this one matters to them.
  note TEXT,

  PRIMARY KEY (user_id, value)
);
```

### Why does it exist?

The user picks two to five areas that matter most and may explain each
one. This is the one onboarding answer with many rows per user, so it
is the one child table. The picks are a set, not a ranking: they are
returned in alphabetical order.

### Relationship

```text
User 1 ───── N Profile Values
```

A new `PUT` of screen 7 replaces the whole set in one transaction.

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

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NULL = active. Set to the moment the goal was archived.
  archived_at TIMESTAMPTZ,

  -- "Why does it matter to you?" Required: every goal carries its own why.
  why_it_matters TEXT NOT NULL,

  -- "What might get in the way?" Optional.
  obstacle TEXT,

  -- "What would be the first sign you are moving?" Optional.
  first_outcome TEXT
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
-   A goal is **active** (`archived_at IS NULL`) or **archived**.
    Archiving hides it from the active list and keeps everything under
    it, read-only; unarchiving sets the column back to `NULL`.
-   A goal with work history cannot be deleted (section 13). It is
    archived instead.

### Why a timestamp and not a boolean?

The same reason as `steps.done_at`: the timestamp answers "is it
archived?" and "since when?" with one column, and the second question
costs nothing to keep.

### Why does a goal carry its own why?

"It knows my goal and why it matters to me" is what the app is built
on, and a person can have more than one goal. Advice for a hard moment
on one goal must use that goal's why, not another's. So the why is a
column here, and it is required. `obstacle` and `first_outcome` are
optional: what might get in the way of this goal, and the first sign of
moving.

### How does a goal relate to the profile?

The profile (section 5) is about the person; a goal is about where they
want to go. There is no foreign key between them. The link is a rule in
the API: a goal cannot be created until the six required screens are
saved. The first goal is the last step of the onboarding wizard, and it
is an ordinary insert here, like every later goal.

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
-   Deleting a task deletes its steps. A task with work history cannot
    be deleted (section 13).
-   While its goal is archived, a task cannot be added, renamed or
    deleted. The API refuses it; the goal is unarchived first.

### Where is the status?

Nowhere in this table. A task's status is read from its steps every
time it is asked for:

```text
no step done (or no steps yet)   →  todo
some steps done, not all         →  in_progress
every step done                  →  done
```

```sql
SELECT id, goal_id, title, created_at,
       (SELECT CASE
                 WHEN count(*) FILTER (WHERE done_at IS NOT NULL) = 0 THEN 'todo'
                 WHEN count(*) FILTER (WHERE done_at IS NULL) = 0 THEN 'done'
                 ELSE 'in_progress'
               END
          FROM steps
         WHERE steps.task_id = tasks.id) AS status
  FROM tasks
 WHERE goal_id = $2 AND user_id = $1
 ORDER BY created_at, id;
```

The first draft had a `status` column. It was removed because a stored
status is a second copy of what the steps already say, and two copies
can disagree: every step done, the column still `todo`. Read from the
steps, the status cannot be wrong, and "a task is done automatically
when all its steps are done" needs no code at all. It is the same idea
as section 14: what can be counted is not stored.

A count without `GROUP BY` always returns one row, also for a task with
no steps, so the status is never `NULL`. `steps_task_idx` keeps the
inner query to the steps of one task.

### Whose goal is it?

`goal_id` is a foreign key to the goal alone. It proves the goal exists,
not that it belongs to the same user as the task. That is checked in
the API before the insert: the goal is read with `user_id = $1`, and a
goal that is someone else's is answered as not found (section 12).

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

  -- Checked when a statement ends, not row by row: see "Why deferrable?".
  UNIQUE (task_id, position) DEFERRABLE INITIALLY IMMEDIATE
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

### Why deferrable?

Reordering changes several positions in one `UPDATE`:

```text
before      A=1  B=2  C=3
wanted      C=1  A=2  B=3
```

A plain unique constraint is checked row by row. The moment A becomes 2,
B is still 2, and PostgreSQL stops the whole statement, although the
result would have been fine.

`DEFERRABLE` moves the check to when the statement has finished and
every row has its new position. `INITIALLY IMMEDIATE` keeps it at the
end of each *statement*, not the end of the transaction, so a real
duplicate is still reported by the statement that made it:

```sql
UPDATE steps SET position = ordered.place
  FROM unnest($3::uuid[]) WITH ORDINALITY AS ordered(id, place)
 WHERE steps.id = ordered.id
   AND steps.task_id = $2 AND steps.user_id = $1;
```

`unnest … WITH ORDINALITY` turns the list of ids into rows of (id,
place), the place counted from 1. Each step takes the place of its id.

### What position is, and is not

-   A new step gets the highest position of its task plus one, so it
    goes last. The task row is locked while this happens, so two steps
    added at the same moment get two different numbers.
-   The numbers can have gaps. Delete the second of three steps and the
    positions are 1 and 3. The order is still right, which is all that
    is asked of them.
-   The API never returns `position`. It returns the steps in order,
    and reordering is sent as a list of ids. So no client can come to
    depend on the numbers.
-   A reorder writes positions 1 to n, which closes any gap.

### Rules

-   A step belongs to exactly one task, and to one user.
-   Deleting a task deletes its steps. A step with a focus session
    cannot be deleted (section 13).
-   `done_at` is written by the server. Marking a step done sets it to
    now only when it is empty, so marking it twice keeps the first
    time. Marking it not done clears it.
-   While its goal is archived, a step cannot be added, renamed, marked
    or deleted.
-   Nothing is written to the task when a step changes. The task's
    status is read from these rows (section 7).

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

  -- No ON DELETE action, on purpose: a step that has sessions cannot be
  -- deleted, nor the task or goal above it (section 13).
  step_id UUID NOT NULL
    REFERENCES steps(id),

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

The API turns the refusal into `409` with `session.already_active`
(`DECISIONS.md`, 2026-10-06). It does not look for a running session
first: a check has a gap, the index has none.

### Other rules

-   A session belongs to exactly one user.
-   A session belongs to exactly one step.
-   `ended_at` cannot be earlier than `started_at`.
-   Rating must be between 1 and 5.

Three rules the database cannot state are asked by the API when a
session starts: the step is the user's own, its goal is not archived,
and the step is not done. And a goal is not archived while a session is
running under it.

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
        │profile_* │   │auth_sessions│   │  goals  │
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

`profile_*` stands for the seven onboarding screen tables and
`profile_values`: each has its own foreign key to `users` (section 5).

------------------------------------------------------------------------

# 12. Ownership

Every table containing user data has `user_id`.

Current ownership columns:

```text
profile_*.user_id           (the eight onboarding tables)
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

# 13. Deletion Policy

**Planning can be deleted. Work history cannot.**

A goal, a task and a step are plans. A session is something that
happened: minutes the user really worked, and the proof of progress the
whole app exists to show. So the cascade stops one level above it:

```text
Delete Goal
    ↓  ON DELETE CASCADE
Delete Tasks
    ↓  ON DELETE CASCADE
Delete Steps
    ↓  no action
A step with a session?  →  the whole delete is refused (error 23503)
```

`sessions.step_id` has no `ON DELETE` action. PostgreSQL then refuses to
delete a step that sessions still point at, and because the refusal
undoes the whole statement, it also refuses the task or goal whose
delete would have cascaded down to that step. Nothing is half-deleted.

The API turns the refusal into `409` with "This has work history.
Archive the goal instead." A goal with no sessions under it is deleted
with its tasks and steps, as before.

### Why the database, and not a check in code?

A check in code ("does this goal have sessions?") followed by a delete
has a gap between the two: a session can start in between. The foreign
key has no gap.

### Why "no action" and not `RESTRICT`?

Both refuse the delete above. The worry with either was deleting a
**user**: that cascades to their steps and also to their sessions in one
statement, and a step must not be refused just because its session is
deleted a moment later in the same statement.

We tried both against the real database (PostgreSQL 16) before choosing.
With both, the goal delete is refused and the user delete goes through.
"No action" is checked at the end of the statement, when the sessions
are gone too. We keep it because it is the default, so the column is a
plain `REFERENCES steps(id)` with nothing extra to remember, and because
it is the one PostgreSQL would let us defer to the end of a transaction
if that is ever needed (`RESTRICT` cannot be deferred).

User deletion still cascades through all of their data. A schema test,
*deleting a user still deletes everything, sessions included*, keeps it
that way.

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
| A user's language is one the app has | CHECK constraint, NOT NULL, no default |
| Goal belongs to one user | FK |
| Task belongs to one goal | FK |
| Step belongs to one task | FK |
| Session belongs to one step | FK |
| Struggle may optionally belong to a session | Nullable FK |
| Only one active session per user | Partial unique index |
| Session cannot end before it starts | CHECK constraint |
| Rating must be 1–5 | CHECK constraint |
| A task's status always agrees with its steps | Not stored: read from `steps.done_at` |
| Step positions are unique within a task | UNIQUE constraint, deferrable: checked when a statement ends |
| Deleting a goal deletes its tasks and steps | ON DELETE CASCADE |
| A step with sessions cannot be deleted, nor the task or goal above it | Foreign key with no ON DELETE action |
| A goal is active or archived | `archived_at` is NULL or a timestamp |
| Every goal has a why | NOT NULL |
| Deleting a session keeps its struggle history | ON DELETE SET NULL |
| One row per user for each onboarding screen | `user_id` is the primary key |
| Required answers of a screen are present | NOT NULL |
| An option field only holds a listed option | CHECK constraint |
| A confidence answer is 1–5 | CHECK constraint |
| A value is picked at most once per user | Primary key `(user_id, value)` |

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
profile_basics
profile_situation
profile_achievements
profile_patterns
profile_self_view
profile_confidence
profile_meaning
profile_values
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
