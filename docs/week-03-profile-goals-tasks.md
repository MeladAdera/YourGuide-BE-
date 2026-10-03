# Week 3 — Profile, onboarding, goals and tasks

Week 2 gave the app a user. This week the user gets data of their own: the onboarding answers, then goals, then tasks. Every route in this week follows one rule from `PROJECT.md`: the `userId` comes from the session cookie, never from the request, and every query filters by it.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Profile](#step-1--profile) | YOU-17 | Done |
| 2 | [Onboarding: the database](#step-2--onboarding-the-database) | — | Done |
| 3 | [Onboarding: screens 1–6](#step-3--onboarding-screens-16) | — | Done |
| 4 | Onboarding: screen 7, values | — | Not started |
| 5 | Onboarding: direction, completion and status | — | Not started |
| 6 | Goals | YOU-18 | Not started |
| 7 | Tasks | YOU-19 | Not started |

Steps 2–5 were added on 2026-10-03, before goals, when the three-question profile from step 1 was redesigned into an eight-screen onboarding. The design and its reasons are in `DECISIONS.md` (the four entries dated 2026-10-03) and `PROJECT.md` §6.1. Their Linear issues are created from that design; the ids are filled in here once they exist.

All commands on this page run inside `backend/`.

---

## Step 1 — Profile

### Why

The profile holds the three onboarding answers: the goal, why it matters, and the usual blocker. Two later features need them:

- **The AI advice (week 6)** is built from these answers. Without them the advice would be generic.
- **The frontend (week 9)** must know whether to show the onboarding screen. `GET /api/profile` answers `404` until onboarding is done, so one status code decides.

It is also the first route that stores user data. It sets the pattern that goals, tasks, steps and sessions copy:

- The handler gets the `userId` from `@CurrentUser()`, which the guard filled from the cookie. The request body cannot say who the user is.
- Every repository method takes `userId` and every query has `WHERE user_id = $1`. Another user's row is treated as not there.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/profile/dto/upsert-profile.dto.ts` | Boundary | The three answers, as `PUT` sends them |
| `src/profile/dto/profile.dto.ts` | Boundary | The profile as the API returns it |
| `src/profile/profile.repository.ts` | Repository | `SELECT` by user, and the create-or-replace `INSERT` |
| `src/profile/profile.service.ts` | Service | Turns "no row" into `404` |
| `src/profile/profile.controller.ts` | Controller | `GET` and `PUT /api/profile` |
| `src/profile/profile.module.ts` | Module | Connects the pieces; registered in `app.module.ts` |
| `test/profile.e2e-spec.ts` | Test | 10 e2e tests |
| `test/api-docs.e2e-spec.ts` | Test | Knows the new route |

### How it works

**The requests**

```
GET /api/profile
Cookie: your_guide_session=<token>

200 OK
{ "goal": "…", "whyItMatters": "…", "usualBlocker": "…", "updatedAt": "2026-10-01T13:40:00.000Z" }
```

```
PUT /api/profile
Cookie: your_guide_session=<token>
{ "goal": "…", "whyItMatters": "…", "usualBlocker": "…" }

200 OK
{ "goal": "…", "whyItMatters": "…", "usualBlocker": "…", "updatedAt": "…" }
```

| Problem | Status |
|---|---|
| No cookie, or the session is gone | `401` |
| `GET` before onboarding | `404` with `Onboarding is not done yet.` |
| A missing or empty answer, an answer longer than 1000 characters, an unknown field | `400` |

**The path of a PUT**

```
Request
   ↓
AuthGuard            cookie → session → userId on the request      none → 401
   ↓
ValidationPipe       are the three answers there and text?         no → 400
   ↓
ProfileController    @CurrentUser() gives the userId
   ↓
ProfileService       hands both to the repository
   ↓
ProfileRepository    INSERT … ON CONFLICT (user_id) DO UPDATE … RETURNING
   ↓
200 with the saved profile
```

We built it in five small steps. Read the files in this order.

**1. The two DTOs** (`src/profile/dto/`)

`UpsertProfileDto` is what `PUT` accepts: three strings, each at least 1 and at most 1000 characters. The limit is generous on purpose; it exists so nobody can store megabytes in a text column.

`Profile` is what the API returns: the three answers and `updatedAt`. It has no `userId`, because the profile you get is always your own. Like `User` in week 2, it is a class so Swagger can describe it.

**2. The repository** (`src/profile/profile.repository.ts`)

```sql
INSERT INTO profiles (user_id, goal, why_it_matters, usual_blocker)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id) DO UPDATE
  SET goal = EXCLUDED.goal,
      why_it_matters = EXCLUDED.why_it_matters,
      usual_blocker = EXCLUDED.usual_blocker,
      updated_at = now()
RETURNING goal, why_it_matters, usual_blocker, updated_at
```

This is one statement that creates **or** replaces, called an *upsert*. `user_id` is the primary key of `profiles`, so the only possible conflict is "this user already has a profile". `EXCLUDED` is the row we tried to insert. On the first call the row is inserted and `updated_at` takes its default, `now()`; on every later call the three answers are replaced and `updated_at` is set to `now()`.

The same reason as the unique email index in register: the code does not `SELECT` first to decide between insert and update. A check in code has a gap between the check and the write; the database has none.

The repository also translates names. PostgreSQL columns are `why_it_matters`; the API speaks `whyItMatters`. `toProfile` is the one place where that happens.

**3. The service** (`src/profile/profile.service.ts`)

`get` turns "no row" into `NotFoundException('Onboarding is not done yet.')`. This is not an error in the data: a new user simply has not answered yet. `upsert` only passes the call through; the SQL already does all the work.

**4. The controller** (`src/profile/profile.controller.ts`)

Nothing here is `@Public()`, so the guard from week 2 protects both routes. The Swagger decorators for the cookie and the `401` sit on the class, so every route in it gets them.

*Why PUT, and not POST + PATCH?* There is one profile per user, and the client always sends the whole thing. `PUT` means "make it look like this". The same call creates the profile the first time and replaces it after that, so the client never has to ask "did I onboard already?" before saving.

*Why 200 on the first PUT, not 201?* The client does not care whether a row was created or replaced; it asked for a profile to look like this, and it does. One answer, one code.

**5. The tests** (`test/profile.e2e-spec.ts`)

| Rule | Test |
|---|---|
| No profile yet is `404` | `answers 404 before onboarding` |
| `PUT` then `GET` returns the same | `saves the answers and returns them on the next get` |
| A second `PUT` replaces and moves `updatedAt`, no second row | `replaces the answers and moves updatedAt on a second put` |
| Another user cannot see it | `shows each user only their own profile` |
| Both routes need a login | `needs a login` |
| Bad input saves nothing | `rejects … with 400 and saves nothing` (5 cases) |

The ownership test is the one to remember. Every table with `user_id` gets one like it.

### Check it

```bash
pnpm test:e2e
```

All 68 tests pass: 10 for the profile are new.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running):

1. **POST /auth/login** → *Execute*, so the browser has the cookie.
2. **GET /profile** → `404`, *Onboarding is not done yet.*
3. **PUT /profile** → *Try it out* → the example answers are filled in → *Execute* → `200` with `updatedAt`.
4. **GET /profile** → `200`, the same answers.
5. **PUT /profile** again with a changed goal → `200`, a newer `updatedAt`. In pgAdmin, `profiles` still has one row.

---

## Step 2 — Onboarding: the database

### Why

Step 1 asked three questions and the first one was the goal. For the app this project describes, that is backwards: advice that fits a person needs to know who they are, where they are now and what matters to them, and a goal written *after* that reflection is more specific and more their own. So the profile became eight screens, with the goal last. `DECISIONS.md` (2026-10-03) has the full reasoning and `PROJECT.md` §6.1 the questions.

The database comes first, before any route, for the same reason as in week 1: the rules live there. Which answers are required, which options exist, that a confidence answer is 1 to 5, that a value is picked once: all of that is a constraint, not a check in code. Steps 3 to 5 then only add the routes on top.

### What we built

| File | Purpose |
|---|---|
| `migrations/0003_onboarding-sections.sql` | Seven screen tables, `profile_values`, and two columns on `profiles` |
| `SCHEMA.md` §5 | One section per table, with the question each column asks |
| `test/schema.e2e-spec.ts` | 4 new tests: the constraints hold, and deleting a user deletes the screens |
| `PROJECT.md` §5, §6.1, §8, §11, §12 | The screens, the new routes, the no-diagnosis rule |
| `DECISIONS.md` | Four entries dated 2026-10-03 |

### How it works

**One table per screen.** Screens 1 to 7 are `profile_basics`, `profile_situation`, `profile_achievements`, `profile_patterns`, `profile_self_view`, `profile_confidence` and `profile_meaning`. Screen 8, the direction, is the `profiles` table from step 1. Every screen table has the same shape:

```sql
CREATE TABLE profile_situation (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  typical_day TEXT NOT NULL,          -- required on this screen
  want_to_change TEXT NOT NULL,       -- required on this screen
  satisfied_with TEXT,                -- optional
  wish_more_time_for TEXT,            -- optional
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Three things follow from this shape, and they are the reason for it:

- `user_id` is the primary key, so there is one row per user and an upsert on it works exactly like the profile in step 1.
- A required answer is `NOT NULL`. In one wide table with forty columns, every column would have to be nullable so a screen could be saved alone, and "required" would exist only in code.
- A screen is done when its row exists. There is no status column to keep in sync.

**Options are CHECK lists.** `employment_status`, `age_range`, `education_level`, `years_experience` and `value` each have a `CHECK (… IN (…))`, like `sessions.outcome` in week 1. In step 3 the same lists appear once more in code, as `as const` arrays, the way `SITUATIONS` does; the test in this step proves the database side.

**The check-in is eight `SMALLINT` columns**, each `CHECK (… BETWEEN 1 AND 5)`, like `sessions.rating`. There is no total column, on purpose: the app stores answers, never a score.

**`profile_values` is the one child table.** A user picks two to five values and may add a note to each, so this is the one answer with many rows per user. Its primary key is `(user_id, value)`: the same value cannot be picked twice.

**Two columns on `profiles`.** `first_outcome` is the optional last question of screen 8. `completed_at` is set when the row is created and never changes; a later edit only moves `updated_at`. The row existing still means "onboarding is done", so `GET /api/profile` keeps answering `404` until then.

**The down migration** drops the eight tables and the two columns, in reverse order.

### Check it

```bash
pnpm migrate up
```

Prints `0003_onboarding-sections` as applied. In pgAdmin, the `your_guide` database now has 16 tables.

```bash
pnpm test:e2e
```

All 72 tests pass: 4 are new, in `test/schema.e2e-spec.ts`, and the table-count test now expects 16 tables.

---

## Step 3 — Onboarding: screens 1–6

### Why

Step 2 gave each screen a table. This step gives each one a route pair, `GET` and `PUT /api/profile/sections/<screen>`, with exactly the meaning `GET` and `PUT /api/profile` had in step 1: `404` until saved, `PUT` creates or replaces the whole screen.

Why one resource per screen, and not one big `PUT`? Because the frontend (week 9) is a wizard. A person answers screen 2, closes the laptop, and comes back tomorrow: their answers must be there, and the wizard must be able to show screen 2 filled in when they press *back*. Both need a screen to be read and saved on its own. The same routes serve the profile page later, where any screen can be edited again.

Why is there no order rule here? Screens 1 to 6 can be saved in any order; nothing depends on it. The one rule that matters, "the direction comes after the reflection", sits where it is enforced, on `PUT /api/profile` in step 5. Rules live where they are checked, not everywhere they could be.

Screen 7 (values) is step 4 because it writes two tables, which needs a transaction and deserves its own explanation.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/profile/answer.decorator.ts` | Boundary | `@Answer()`: one rule for every free-text answer |
| `src/database/only-row.ts` | Repository | The row an `INSERT … RETURNING` must produce |
| `src/profile/sections/<screen>/upsert-<screen>.dto.ts` | Boundary | The screen as `PUT` sends it, one file per screen |
| `src/profile/sections/<screen>/<screen>.dto.ts` | Boundary | The screen as the API returns it |
| `src/profile/sections/<screen>/<screen>.repository.ts` | Repository | `SELECT` by user, and the create-or-replace `INSERT` |
| `src/profile/sections/basics/basics-options.ts` | Boundary | The option lists, mirrored from the `CHECK` constraints |
| `src/profile/sections/sections.service.ts` | Service | Turns "no row" into `404` |
| `src/profile/sections/sections.controller.ts` | Controller | 12 routes under `/api/profile/sections` |
| `src/profile/profile.module.ts` | Module | Registers the new controller and six repositories |
| `test/helpers/onboarding-answers.ts` | Test | Example answers for every screen, reused by later steps |
| `test/profile-sections.e2e-spec.ts` | Test | 72 e2e tests, the same 7 rules for all six screens |
| `test/api-docs.e2e-spec.ts` | Test | Knows the 6 new paths |

The screens are `basics`, `situation`, `achievements`, `patterns`, `self-view` and `confidence`.

### How it works

**The requests.** Every screen has the same two calls; this is screen 2.

```
GET /api/profile/sections/situation
Cookie: your_guide_session=<token>

200 OK
{ "typicalDay": "…", "wantToChange": "…", "satisfiedWith": null, "wishMoreTimeFor": "…", "updatedAt": "2026-10-03T19:40:00.000Z" }
```

```
PUT /api/profile/sections/situation
Cookie: your_guide_session=<token>
{ "typicalDay": "…", "wantToChange": "…", "wishMoreTimeFor": "…" }

200 OK
{ … the saved screen, with satisfiedWith: null … }
```

| Problem | Status |
|---|---|
| No cookie, or the session is gone | `401` |
| `GET` before the screen is saved | `404` with `This screen is not saved yet.` |
| A missing or empty required answer, an answer that is too long, an option outside its list, a check-in answer that is not a whole number from 1 to 5, an unknown field | `400` |

**Optional answers.** An optional answer may be left out or sent as `null`; both clear it, and it comes back as `null`. A `PUT` is the whole screen, so leaving an answer out on the second save clears it. That is what `PUT` means, and it keeps the client simple: it sends what the form shows, always.

We built it in four small steps. Read the files in this order.

**1. One rule for every answer** (`src/profile/answer.decorator.ts`)

Twenty-two free-text answers would mean twenty-two copies of the same five decorators. `@Answer({ example, description, max, optional })` bundles them with Nest's `applyDecorators`: a non-empty string up to `max` characters (1000 by default, 3000 for "who are you", 120 for the occupation), optional ones also get `@IsOptional()` and are marked nullable in Swagger. The `description` is the question itself, so Swagger shows the exact wording the frontend must use.

The check-in has its own small version, `@Statement(text)`, in `upsert-confidence.dto.ts`: a whole number from 1 to 5, with the statement as the description. All eight statements are in that one file.

**2. The option lists** (`src/profile/sections/basics/basics-options.ts`)

Employment status, age range, education level and years of experience are `as const` arrays with their types derived from them, exactly like `SITUATIONS` in `src/struggles/`. Each array must match the `CHECK` list in `SCHEMA.md` §5.1: the array is what the DTO validates with (`@IsIn`), the `CHECK` is what the database enforces, and the schema test from step 2 proves the database side. The country is checked with `@IsISO31661Alpha2()`: a two-letter code such as `AE`, never a city.

One TypeScript detail worth knowing: the DTOs import the *types* with `import type` and the *arrays* with a plain `import`. Decorated classes emit type metadata at runtime, so TypeScript insists on knowing which imports are values and which are only types (error TS1272 otherwise).

**3. The repositories** (`src/profile/sections/<screen>/<screen>.repository.ts`)

Each one is the profile repository from step 1 with other column names: `SELECT … WHERE user_id = $1`, and `INSERT … ON CONFLICT (user_id) DO UPDATE … RETURNING`. Optional answers are passed as `input.x ?? null`. `onlyRow` replaces the three-line "the insert returned no row" check that every upsert needs.

Six near-identical files, on purpose. A generic "save any screen" function would be shorter and much harder to read; each file can be understood on its own, and the SQL is visible.

**4. Service and controller** (`sections.service.ts`, `sections.controller.ts`)

The service has `get` and `upsert` per screen; the `get` side shares one `saved()` helper that turns `undefined` into `NotFoundException('This screen is not saved yet.')`. The controller has twelve routes with the Swagger tag `onboarding`. Nothing is `@Public()`, so the week 2 guard protects everything.

**5. The tests** (`test/profile-sections.e2e-spec.ts`)

One `describe.each` runs the same seven rules against all six screens. Each screen contributes its example answers, its required subset, its optional keys, one changed answer, and its own list of bodies that must be refused.

| Rule | Test |
|---|---|
| Not saved yet is `404` | `answers 404 before the screen is saved` |
| `PUT` then `GET` returns the same | `saves the answers and returns them on the next get` |
| Optional answers left out are `null` | `returns null for every optional answer left out` |
| A second `PUT` replaces, no second row | `replaces the answers on a second put and keeps one row` |
| A later `PUT` without an optional answer clears it | `clears an optional answer that a later put leaves out` |
| Another user cannot see it | `shows each user only their own screen` |
| Both routes need a login | `needs a login` |
| Bad input saves nothing | `rejects … with 400 and saves nothing` (4 to 6 cases per screen) |

### Check it

```bash
pnpm test:e2e
```

All 144 tests pass: 72 are new, in `test/profile-sections.e2e-spec.ts`.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running), under the **onboarding** tag:

1. **POST /auth/login** → *Execute*, so the browser has the cookie.
2. **GET /profile/sections/situation** → `404`, *This screen is not saved yet.*
3. **PUT /profile/sections/situation** → *Try it out* → remove the `satisfiedWith` line → *Execute* → `200`, with `satisfiedWith: null`.
4. **PUT /profile/sections/confidence** → change one answer to `6` → `400`. Change it back → `200`.
5. **GET /profile/sections/basics** → still `404`: screens are saved one by one.
