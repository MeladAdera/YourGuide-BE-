# Week 3 — Profile, onboarding, goals and tasks

Week 2 gave the app a user. This week the user gets data of their own: the onboarding answers, then goals, then tasks. Every route in this week follows one rule from `PROJECT.md`: the `userId` comes from the session cookie, never from the request, and every query filters by it.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Profile](#step-1--profile) | YOU-17 | Done |
| 2 | [Onboarding: the database](#step-2--onboarding-the-database) | YOU-49 | Done |
| 3 | [Onboarding: screens 1–6](#step-3--onboarding-screens-16) | YOU-50 | Done |
| 4 | [Onboarding: screen 7, values](#step-4--onboarding-screen-7-values) | YOU-51 | Done |
| 5 | [Onboarding: direction, completion and status](#step-5--onboarding-direction-completion-and-status) | YOU-52 | Done |
| 6 | [Goals](#step-6--goals) | YOU-18 | Done |
| 7 | [The direction moves onto goals](#step-7--the-direction-moves-onto-goals) | YOU-53 | Done |
| 8 | [Every error carries a code](#step-8--every-error-carries-a-code) | YOU-54 | Done |
| 9 | Validation errors name the field and the rule | YOU-55 | Not started |
| 10 | The user's language on the account | YOU-56 | Not started |
| 11 | Tasks | YOU-19 | Not started |

Steps 2–5 were added on 2026-10-03, before goals, when the three-question profile from step 1 was redesigned into an eight-screen onboarding. The design and its reasons are in `DECISIONS.md` (the four entries dated 2026-10-03) and `PROJECT.md` §6.1. Their Linear issues, YOU-49 to YOU-52, were created from that design. Step 7 was added on 2026-10-04, after using the API showed that screen 8 and goals were two homes for one thing.

Steps 8 to 10 were added on 2026-10-04, when English and Arabic were chosen as the app's two languages. They come before tasks so that every module built after them follows the rule from its first day.

All commands on this page run inside `backend/`.

---

## Step 1 — Profile

> **Changed in steps 5 and 7.** This route pair no longer exists in this form. The three answers it saved describe a goal, so since step 7 they are fields of a goal (`POST /api/goals`), and `GET /api/profile` returns the seven onboarding screens. The text below describes step 1 as it was built. Its *Why* still holds, and the pattern it set is the one every screen table and the goals module copied.

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

> **Changed in step 7.** The `profiles` table, and the two columns this step added to it, are gone: screen 8 became the first goal. Everything below about the seven screen tables and `profile_values` is unchanged.

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

---

## Step 4 — Onboarding: screen 7, values

### Why

Screen 7 asks "what matters to you?" twice: as two to five picks from a fixed list, and in the person's own words. It is the screen that turns reflection into direction, so its answers are half of the "why" behind the goal on screen 8, and the AI advice in week 6 can say "you told me family and learning matter most" instead of guessing.

It is a step of its own because it is the one screen that writes **two tables**. The picks are many rows per user (`profile_values`), the free text is one row (`profile_meaning`), and a `PUT` must change both or neither. That is what a transaction is for, and this is the first place in the project that needs one, so it deserves its own explanation.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/profile/sections/values/life-values.ts` | Boundary | The ten values, mirrored from the `CHECK` constraint; the 2-to-5 limits |
| `src/profile/sections/values/upsert-values.dto.ts` | Boundary | The screen as `PUT` sends it: a list of picks plus three answers |
| `src/profile/sections/values/values.dto.ts` | Boundary | The screen as the API returns it |
| `src/profile/sections/values/meaning.repository.ts` | Repository | `profile_meaning`: the usual select and upsert |
| `src/profile/sections/values/values.repository.ts` | Repository | `profile_values`: read the set, replace the set |
| `src/profile/sections/sections.service.ts` | Service | `getValues`, and `upsertValues` inside one transaction |
| `src/profile/sections/sections.controller.ts` | Controller | `GET` and `PUT /api/profile/sections/values` |
| `src/profile/answer.decorator.ts` | Boundary | `MAX_NOTE`, 300 characters for a note on a pick |
| `test/profile-values.e2e-spec.ts` | Test | 18 e2e tests |

### How it works

**The request**

```
PUT /api/profile/sections/values
Cookie: your_guide_session=<token>
{
  "values": [
    { "value": "learning", "note": "The one thing nobody can take back." },
    { "value": "health" }
  ],
  "personToBecome": "Someone who finishes what he starts.",
  "wouldRegretNotDoing": "Never building something of my own."
}

200 OK
{
  "values": [
    { "value": "health", "note": null },
    { "value": "learning", "note": "The one thing nobody can take back." }
  ],
  "personToBecome": "…", "wouldRegretNotDoing": "…", "rememberedFor": null,
  "updatedAt": "2026-10-03T20:10:00.000Z"
}
```

The picks come back in alphabetical order, whatever order they were sent in. They are a set, not a ranking: `profile_values` has no position column, so the API cannot pretend to remember one.

| Problem | Status |
|---|---|
| Fewer than 2 or more than 5 picks, a value picked twice, a value outside the list, a pick that is not an object, a note over 300 characters, an unknown field inside a pick | `400` |
| Everything step 3 refuses: a missing or empty `personToBecome`, an answer over 1000 characters, an unknown field | `400` |

**1. Validating a list of objects** (`upsert-values.dto.ts`)

`values` is the first request field that is a list of objects, so it needs four decorators that the other screens do not: `@IsArray()` with `@ArrayMinSize(2)` and `@ArrayMaxSize(5)`; `@ArrayUnique(pickValue)`, which compares picks by their `value`; `@ValidateNested({ each: true })`, which runs `ValuePickDto`'s own rules on every item; and `@Type(() => ValuePickDto)` from class-transformer, which tells the validation pipe what class each item is. Without `@Type`, the items would stay plain objects and nested validation would silently check nothing.

`pickValue` guards against a pick that is not an object (`"health"` or `null`): it returns the item itself, so uniqueness still works and `@ValidateNested` then refuses the item with `400` instead of the server crashing on `null.value`.

The whitelist from week 1 applies inside the list too: `{ "value": "health", "rank": 1 }` is refused for the unknown field.

**2. Replacing a set** (`values.repository.ts`)

There is no "upsert a set" in SQL. `replace` deletes the user's picks and inserts the new ones:

```sql
DELETE FROM profile_values WHERE user_id = $1;

INSERT INTO profile_values (user_id, value, note)
SELECT $1, value, note
  FROM unnest($2::text[], $3::text[]) AS picks(value, note);
```

`unnest` with two arrays produces one row per pair, so any number of picks is one `INSERT` with three parameters: the user, the array of values, the array of notes (with `null` where there is none). The alternative, building `($1, $2, $3), ($1, $4, $5), …` by hand, is longer and easier to get wrong.

**3. The transaction** (`sections.service.ts`)

`upsertValues` runs three repository calls inside `db.withTransaction` from week 1: upsert the free text, replace the picks, read the picks back. All three get the same `client`, so they are one transaction. If anything fails after the `DELETE`, PostgreSQL rolls back and the old picks are still there. Without the transaction a user could end up with free text and no picks, or with their picks deleted and nothing inserted.

The read-back at the end is deliberate. It is one more query, but it means the response is exactly what the next `GET` will return, in the same order, from the same `SELECT`.

**4. What makes the screen "saved"?** The `profile_meaning` row. `getValues` looks it up first and answers `404` if it is missing; the picks are then read with the same `userId`. The picks can never exist without the row, because they are written in the same transaction and the DTO demands at least two.

**5. The tests** (`test/profile-values.e2e-spec.ts`)

The same seven rules as step 3, plus the ones only this screen has:

| Rule | Test |
|---|---|
| Picks come back sorted, with `null` notes | `saves the answers and returns the picks in alphabetical order` |
| A second `PUT` replaces the whole set, the free text keeps one row | `replaces the whole set of picks on a second put` |
| 1 pick, 6 picks, a duplicate, an unknown value, a non-object pick, a `null` pick, a long note, an unknown field in a pick | `rejects … with 400 and saves nothing` (12 cases) |

### Check it

```bash
pnpm test:e2e
```

All 162 tests pass: 18 are new, in `test/profile-values.e2e-spec.ts`.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running), under the **onboarding** tag:

1. **POST /auth/login** → *Execute*.
2. **PUT /profile/sections/values** → *Try it out* → *Execute* with the example → `200`, picks in alphabetical order.
3. Change one pick's `value` to the same as another → `400`, *Each value can be picked only once.*
4. In pgAdmin, `profile_values` has as many rows as picks; `profile_meaning` has one.

---

## Step 5 — Onboarding: direction, completion and status

> **Changed in step 7.** The 409 rule now guards `POST /api/goals`. `PUT /api/profile` is removed, `GET /api/profile` returns the seven screens at the top level with no `sections` and no `completedAt`, and `completed` means the six required screens are saved. `GET /api/profile/onboarding` works as described here. Read this step for the reasoning, and step 7 for how it looks now.

### Why

Three things were still missing after steps 2 to 4:

- **The order rule.** The whole redesign rests on "the goal comes after the reflection". Until this step nothing enforced it: a client could save the direction first and skip everything else. `PROJECT.md` §4 says all business logic lives in NestJS, so the rule goes into the backend, not into the wizard. Now `PUT /api/profile` answers `409` with the missing screens until screens 2 to 7 exist.
- **One read for the whole person.** The AI advice (week 6) and the profile page (week 9) need every answer at once, not eight calls. `GET /api/profile` now returns the direction and every screen.
- **Resume.** A wizard the person can leave half-way needs one question answered on return: *where was I?* `GET /api/profile/onboarding` answers it, and never with `404`.

The one thing that did **not** change is the meaning of `GET /api/profile`: `404` until onboarding is complete, exactly as in step 1. The frontend still decides "show the wizard or the app" on one status code.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/profile/screens.ts` | Rule | The seven screen names, and which are required |
| `src/profile/onboarding.repository.ts` | Repository | One query: which screens have a row |
| `src/profile/dto/onboarding-status.dto.ts` | Boundary | `completed`, `screens`, `missing` |
| `src/profile/dto/upsert-profile.dto.ts` | Boundary | Screen 8 with the optional `firstOutcome`, using `@Answer()` |
| `src/profile/dto/profile.dto.ts` | Boundary | The whole profile: direction at the top, `sections` below |
| `src/profile/profile.repository.ts` | Repository | Reads and writes `first_outcome`; never updates `completed_at` |
| `src/profile/profile.service.ts` | Service | The `409` rule, the status, the full read |
| `src/profile/profile.controller.ts` | Controller | `GET /api/profile/onboarding`; the `409` in Swagger |
| `src/profile/sections/sections.service.ts` | Service | `findAll`: every screen, `null` where not saved |
| `test/helpers/save-required-screens.ts` | Test | Saves screens 2–7 for a user |
| `test/profile.e2e-spec.ts` | Test | 14 tests (was 10): the `409`, `firstOutcome`, `completedAt`, `sections` |
| `test/profile-onboarding.e2e-spec.ts` | Test | 5 tests for the status route |

### How it works

**The requests**

```
GET /api/profile/onboarding
Cookie: your_guide_session=<token>

200 OK
{
  "completed": false,
  "screens": { "basics": false, "situation": true, "achievements": true, "patterns": false,
               "selfView": false, "confidence": false, "values": false },
  "missing": ["patterns", "selfView", "confidence", "values"]
}
```

```
PUT /api/profile                            (screens 2–7 not all saved)
{ "goal": "…", "whyItMatters": "…", "usualBlocker": "…" }

409 Conflict
{ "statusCode": 409, "error": "Conflict", "message": "Finish these screens first.",
  "missing": ["patterns", "selfView", "confidence", "values"] }
```

```
PUT /api/profile                            (screens 2–7 saved)
{ "goal": "…", "whyItMatters": "…", "usualBlocker": "…", "firstOutcome": "…" }

200 OK
{
  "goal": "…", "whyItMatters": "…", "usualBlocker": "…", "firstOutcome": "…",
  "completedAt": "2026-10-03T20:30:00.000Z", "updatedAt": "2026-10-03T20:30:00.000Z",
  "sections": {
    "basics": null,
    "situation": { … }, "achievements": { … }, "patterns": { … },
    "selfView": { … }, "confidence": { … }, "values": { … }
  }
}
```

`GET /api/profile` returns the same body as the `200` above, or `404` before the direction exists.

**1. Which screens are required** (`src/profile/screens.ts`)

`SCREENS` lists the seven screen names in wizard order; `REQUIRED_SCREENS` is the same list without `basics`. That one line is the product rule. It is a constant, not configuration: the rule is part of the product, and changing it is a decision that belongs in `DECISIONS.md`, not in an environment variable.

**2. One query for the status** (`src/profile/onboarding.repository.ts`)

```sql
SELECT
  EXISTS (SELECT 1 FROM profile_basics    WHERE user_id = $1) AS basics,
  EXISTS (SELECT 1 FROM profile_situation WHERE user_id = $1) AS situation,
  …
  EXISTS (SELECT 1 FROM profiles          WHERE user_id = $1) AS direction
```

Eight `EXISTS` in one statement, one row of booleans back. This is the payoff of "a screen is saved when its row exists" from step 2: there is no status column to read, and nothing that can be out of date. Screen 7 is represented by `profile_meaning`, because its picks can never exist without that row (step 4).

**3. The 409** (`src/profile/profile.service.ts`)

`upsert` calls `status` first and refuses if `missing` is not empty. The check runs on every save, not only the first: it costs one query, and it means the rule has no exceptions to remember. There is no `DELETE` for a screen, so a completed profile can never fall back into the missing state.

The error body is built by hand (`statusCode`, `error`, `message`, `missing`) so it has the same shape as every other error, plus the one field the wizard needs. `409 Conflict` is the status for "the request is fine, the state is not": the body was valid, the person is just not there yet.

**4. The full read** (`sections.service.ts`, `findAll`)

Seven lookups in `Promise.all`, so they run at the same time on the pool, then the picks for screen 7 if its row exists. A screen that is not saved is `null`, not `404`: the profile exists even when basics was skipped. `ProfileService.get` combines the direction row with that object. Both `get` and `upsert` return the same shape, so the wizard's last `PUT` already gives the frontend everything it shows next.

**5. `completedAt` never moves** (`profile.repository.ts`)

The upsert's `DO UPDATE SET …` lists every column except `completed_at`, so a later edit of the goal keeps the day onboarding was finished. The test *keeps completedAt on a second put* proves it.

**6. The tests**

| Rule | Test |
|---|---|
| Refused with the missing list until screens 2–7 exist; basics changes nothing | `refuses the direction with 409 until screens 2–7 are saved` |
| The whole profile comes back, with `basics: null` | `saves the direction and returns the whole profile on the next get` |
| Basics appears once saved | `includes basics once that optional screen is saved too` |
| `firstOutcome` is optional and clearable | `saves the optional first outcome and clears it when left out` |
| `completedAt` is set once | `replaces the answers, moves updatedAt and keeps completedAt on a second put` |
| Status is never `404`, reports each screen, and completes with the direction | `test/profile-onboarding.e2e-spec.ts` |

### Check it

```bash
pnpm test:e2e
```

All 171 tests pass: 5 are new in `test/profile-onboarding.e2e-spec.ts`, and `test/profile.e2e-spec.ts` grew from 10 to 14.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running):

1. **POST /auth/register** with a new email → *Execute*, so the browser has a cookie for a brand-new user.
2. **GET /profile/onboarding** → `200`, everything `false`, six names under `missing`.
3. **PUT /profile** → `409`, the same six names.
4. Under **onboarding**, save screens 2 to 7 with their examples. **GET /profile/onboarding** → `missing: []`, `completed: false`.
5. **PUT /profile** → `200` with `completedAt` and all six screens under `sections`, `basics: null`.
6. **GET /profile/onboarding** → `completed: true`.

---

## Step 6 — Goals

> **Changed in step 7.** A goal now also has `whyItMatters`, `obstacle` and `firstOutcome`. `PATCH` changes any of them, not only the title, and `POST` is refused with 409 before onboarding is complete. The delete rule, the ownership pattern and archive, described below, are unchanged.

### Why

Onboarding ends with a direction: the long-term aim, in the person's own words. A goal is the first concrete thing under it. Three reasons it is built now:

- **Everything after it hangs on a goal.** A task needs a `goal_id`, a step needs a task, a focus session needs a step. Nothing in weeks 3 to 7 can exist without a goal row.
- **It is the first list.** The profile and every onboarding screen are one row per user, found by `user_id` alone. A goal is one of many, found by its own `id`. So this step sets the pattern that tasks, steps and sessions copy: every statement says `WHERE id = … AND user_id = …`, and a row that belongs to someone else is answered exactly like a row that does not exist, with `404`.
- **It carries the first rule about deleting.** `PROJECT.md` §6.2: a goal without work history can be deleted; a goal with history is archived, so progress keeps it. That rule protects the one thing the app exists to show, and it had to be decided before tasks and steps, which follow the same rule.

How a goal relates to the profile: they are not linked in the database. After the last onboarding screen the frontend offers "turn this into your first goal", prefilled from the direction, and calls the ordinary `POST /api/goals`. The backend creates nothing automatically.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `migrations/0004_goal-archive-and-work-history.sql` | Database | `goals.archived_at`; `sessions.step_id` stops cascading |
| `src/goals/dto/goal-title.dto.ts` | Boundary | The title, for create and for rename |
| `src/goals/dto/list-goals.query.ts` | Boundary | `?archived=true` or `false` |
| `src/goals/dto/goal.dto.ts` | Boundary | A goal as the API returns it |
| `src/goals/goals.repository.ts` | Repository | Six statements, every one filtered by `user_id` |
| `src/goals/goals.service.ts` | Service | "No row" becomes `404`; the foreign-key refusal becomes `409` |
| `src/goals/goals.controller.ts` | Controller | Six routes under `/api/goals` |
| `src/goals/goals.module.ts` | Module | Registered in `app.module.ts` |
| `src/database/pg-errors.ts` | Repository | `isForeignKeyViolation`, next to `isUniqueViolation` |
| `src/sessions/session-constraints.ts` | Rule | The constraint name and the message, reused by tasks and steps |
| `test/goals.e2e-spec.ts` | Test | 22 e2e tests |
| `test/schema.e2e-spec.ts` | Test | 4 tests where there was 1: what a delete may and may not remove |
| `test/api-docs.e2e-spec.ts` | Test | Knows the 4 new paths |

It is two commits: the database change, then the API.

### How it works

**The routes**

| Request | Answer |
|---|---|
| `GET /api/goals` or `?archived=false` | `200`, the active goals, oldest first |
| `GET /api/goals?archived=true` | `200`, the archived goals |
| `POST /api/goals` `{ "title": "…" }` | `201`, the new goal |
| `PATCH /api/goals/:id` `{ "title": "…" }` | `200`, the renamed goal |
| `POST /api/goals/:id/archive` | `200`, the goal with `archivedAt` set |
| `POST /api/goals/:id/unarchive` | `200`, the goal with `archivedAt: null` |
| `DELETE /api/goals/:id` | `204`, or `409` when the goal has work history |

A goal looks like this:

```
{ "id": "5b0c…", "title": "Ship my first product",
  "createdAt": "2026-10-04T07:10:00.000Z", "archivedAt": null }
```

| Problem | Status |
|---|---|
| No cookie, or the session is gone | `401` |
| A missing or empty title, one over 200 characters, an unknown field; an `:id` that is not a UUID; `archived` that is not `true` or `false` | `400` |
| No goal with that id, **or it belongs to someone else** | `404` with `Goal not found.` |
| Deleting a goal that has a focus session on one of its steps | `409` with `This has work history. Archive the goal instead.` |

**1. The database first** (`migrations/0004_goal-archive-and-work-history.sql`)

Two changes, both needed by the rule above.

`goals.archived_at TIMESTAMPTZ`, `NULL` while the goal is active. A timestamp and not a boolean for the same reason as `steps.done_at`: one column answers "is it archived?" and "since when?".

The second change is the important one. Schema v1 cascaded a delete all the way down: goal → tasks → steps → **sessions**. The migration removes `ON DELETE CASCADE` from the last link only:

```text
Delete Goal
    ↓  cascade
Delete Tasks
    ↓  cascade
Delete Steps
    ↓  no action
A step with a session?  →  PostgreSQL refuses the whole delete (error 23503)
```

Because the refusal undoes the whole statement, nothing is half-deleted: the goal, its tasks and its steps are all still there.

*Why let the database refuse, and not check in code first?* "Does this goal have sessions?" followed by `DELETE` is two statements with a gap between them; a session could start in the gap. The foreign key has no gap. It is the same choice as the unique email index in week 2: the database decides, the code translates.

*Why "no action" and not `RESTRICT`?* The worry was deleting a whole user, which cascades to their steps and to their sessions in one statement. Before writing the migration we tried both variants against the real database, inside a transaction that was rolled back. Both refuse the goal delete; both let the user delete through. We keep "no action" because it is the default, so the column is a plain `REFERENCES steps(id)`. The schema test *deleting a user still deletes everything, sessions included* protects the behaviour. `DECISIONS.md` (2026-10-04) has the full note.

**2. The repository** (`src/goals/goals.repository.ts`)

Six statements. Look at the `WHERE` of every one that touches a single goal:

```sql
UPDATE goals SET title = $3
 WHERE id = $2 AND user_id = $1
 RETURNING id, title, created_at, archived_at
```

`user_id = $1` is in the statement itself, not in a check before it. If the goal belongs to someone else, the statement simply matches no row: `rename`, `archive` and `unarchive` return `undefined`, and `delete` returns `false`. There is no way to forget the ownership check, because there is no separate check to forget.

Two small things worth reading:

- The list uses `(archived_at IS NOT NULL) = $2`, so one statement serves both the active and the archived list.
- Archive uses `COALESCE(archived_at, now())`: archiving a goal that is already archived keeps the first timestamp. The call is safe to repeat.

**3. The service** (`src/goals/goals.service.ts`)

`found()` turns `undefined` into `NotFoundException('Goal not found.')`, the same helper shape as `saved()` in the onboarding screens.

`delete` is the one method with a decision in it:

```ts
try {
  deleted = await this.goals.delete(this.db.pool, userId, goalId);
} catch (error) {
  if (isForeignKeyViolation(error, SESSION_STEP_FK)) {
    throw new ConflictException('This has work history. Archive the goal instead.');
  }
  throw error;
}
if (!deleted) throw new NotFoundException('Goal not found.');
```

It asks for one specific constraint by name, `sessions_step_id_fkey`, so any other database error still surfaces as a real error instead of a misleading `409`.

*What does another user get when they try to delete my goal that has history?* `404`, not `409`. Their `DELETE … AND user_id = $1` matches no row, so nothing is deleted and the foreign key is never asked. A `409` would have told them the goal exists.

**4. The controller** (`src/goals/goals.controller.ts`)

- `ParseUUIDPipe` on every `:id`. Without it, `not-a-uuid` would reach PostgreSQL, which rejects the value, and the client would get `500` for its own mistake. With it: `400`.
- Archive and unarchive are `POST /:id/archive` and `/unarchive`, not a `PATCH` with an `archived` field. Archiving is something that happens to a goal, with its own rule; `PATCH` stays "rename" and nothing else. They answer `200`, not the `201` that `POST` gives by default, because nothing new is created.
- `ListGoalsQuery` validates the query string like a body. Query values are always text, so `archived` is the string `'true'` or `'false'`, and the controller compares it with `=== 'true'`.

**5. The tests** (`test/goals.e2e-spec.ts`)

Tasks, steps and sessions have no API yet, so the tests insert them with SQL to build the two situations the delete rule cares about.

| Rule (from the issue's *Done when*) | Test |
|---|---|
| Archive hides from the active list; unarchive restores | `archive hides the goal from the active list; unarchive restores it` |
| Delete without sessions removes tasks and steps | `deletes a goal without sessions, with its tasks and steps` |
| Delete with a session is `409`, nothing deleted | `refuses to delete a goal with a session: 409, nothing deleted` |
| User B gets `404` on every endpoint | `answers 404 on every endpoint for another user's goal` |

And the rest: creation order in the list, rename, archiving twice keeps the first timestamp, `404` for an unknown id, `400` for a malformed id or filter, `401` on all six routes, and five bad titles, each tried on create and on rename.

### Check it

```bash
pnpm migrate up
pnpm test:e2e
```

`0004_goal-archive-and-work-history` is applied, and all 196 tests pass: 22 are new in `test/goals.e2e-spec.ts`, and `test/schema.e2e-spec.ts` has 3 more.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running), under the **goals** tag:

1. **POST /auth/login** → *Execute*, so the browser has the cookie.
2. **POST /goals** → `201`. Copy the `id`.
3. **GET /goals** → your goal. **GET /goals** with `archived` = `true` → `[]`.
4. **POST /goals/{id}/archive** → `200` with `archivedAt`. **GET /goals** → `[]`; with `archived` = `true` → your goal.
5. **POST /goals/{id}/unarchive** → `archivedAt: null` again.
6. **PATCH /goals/{id}** with `not-a-uuid` as the id → `400`.
7. **DELETE /goals/{id}** → `204`. **GET /goals** → `[]`.

The `409` needs a focus session, and sessions have no route until week 5. Until then the test *refuses to delete a goal with a session* is where to see it.

---

## Step 7 — The direction moves onto goals

### Why

This step exists because the app was used. With the seven reflection screens saved and a goal created, the next call, `PUT /api/profile`, asked for a goal, why it matters and what blocks it. All of that had just been given.

| Screen 8 asked for | It already lived in |
|---|---|
| `goal` | the goal created with `POST /api/goals` |
| `usualBlocker` | screen 4, "what do you keep postponing or avoiding" |
| `whyItMatters` | nowhere else, but it is the why *of a goal* |
| `firstOutcome` | nowhere else, but it is the first outcome *of a goal* |

Every field on screen 8 described a goal, not the person, and a `goals` table already existed. Two homes for one thing causes three problems:

- **Typed twice.** The same goal in the profile and in `goals`.
- **Only one why.** The why sat on the profile, so a second goal had none. Advice for a hard moment on goal two would have used goal one's why.
- **"Unfinished" with everything there.** A user with seven screens and a goal was still not onboarded, because one more route had not been called.

How did it happen? In step 5 the three original answers from step 1 were kept as "screen 8" so the old route would not break. In step 6 goals arrived with their own title. Each step was reasonable alone; together they overlapped. It was invisible in the design and obvious in the first five minutes of use, which is the lesson: **try each step through Swagger as a user would, before building the next one on top of it.**

### What we built

Three commits, each with every test passing.

| Commit | What |
|---|---|
| 1 | The Swagger examples fixed, and a test that sends every one of them to the API |
| 2 | A goal carries its own why, obstacle and first outcome; `PATCH` changes only what is sent |
| 3 | The direction leaves the profile: the 409 rule moves to `POST /api/goals`, `PUT /api/profile` and the `profiles` table are removed |

| File | Layer | Purpose |
|---|---|---|
| `migrations/0005_goal-why.sql` | Database | `goals.why_it_matters` (required), `obstacle`, `first_outcome` |
| `migrations/0006_direction-into-goals.sql` | Database | Every saved direction becomes a goal; `profiles` is dropped |
| `src/goals/dto/create-goal.dto.ts` | Boundary | A new goal: title, why, optional obstacle and first outcome |
| `src/goals/dto/update-goal.dto.ts` | Boundary | `PATCH`: any of the four, each one optional |
| `src/goals/goals.repository.ts` | Repository | `create` with four answers; `update` replaces `rename` |
| `src/goals/goals.service.ts` | Service | `create` asks `ProfileService.requireOnboarded` first |
| `src/goals/goals.module.ts` | Module | Imports `ProfileModule` |
| `src/profile/profile.service.ts` | Service | `get`, `status`, and the order rule `requireOnboarded` |
| `src/profile/profile.controller.ts` | Controller | Reading only: `GET /profile`, `GET /profile/onboarding` |
| `src/profile/dto/profile.dto.ts` | Boundary | The profile is the seven screens |
| `src/profile/onboarding.repository.ts` | Repository | Seven `EXISTS`, no direction |
| `src/common/answer.decorator.ts` | Boundary | Moved out of `profile/`: goals use it too. States `type: String` |
| `test/api-docs-examples.e2e-spec.ts` | Test | Every documented request example is accepted by the API |
| `test/goals.e2e-spec.ts`, `test/profile.e2e-spec.ts`, `test/profile-onboarding.e2e-spec.ts` | Test | Rewritten for the new shape |

Removed: `src/profile/profile.repository.ts`, `src/profile/dto/upsert-profile.dto.ts`, `src/goals/dto/goal-title.dto.ts`.

### How it works

**The shape now**

```text
PUT /api/profile/sections/<screen>   × 7     who am I · where am I now · what matters
        ↓   the six required screens saved = onboarding complete
POST /api/goals                              where do I want to go · why
        ↓
tasks, steps, sessions                       what next
```

The wizard still ends with the goal. The difference is where it is stored: the last step is the ordinary create-goal call, the same one used for every later goal.

```
POST /api/goals
{ "title": "Ship my first product",
  "whyItMatters": "I want to build my own products without waiting for anyone.",
  "obstacle": "I open the editor, feel lost, and switch to something easier.",
  "firstOutcome": "One small project online that someone other than me uses." }

201 Created
{ "id": "5b0c…", "title": "…", "whyItMatters": "…", "obstacle": "…", "firstOutcome": "…",
  "createdAt": "2026-10-04T09:10:00.000Z", "archivedAt": null }
```

```
POST /api/goals                              (a required screen is not saved yet)

409 Conflict
{ "statusCode": 409, "error": "Conflict", "message": "Finish these screens first.",
  "missing": ["patterns", "selfView", "confidence", "values"] }
```

```
GET /api/profile                             (404 until the six required screens are saved)

200 OK
{ "basics": null, "situation": { … }, "achievements": { … }, "patterns": { … },
  "selfView": { … }, "confidence": { … }, "values": { … } }
```

**1. A goal's own why** (`migrations/0005_goal-why.sql`)

`why_it_matters` is `NOT NULL`: "it knows my goal and why it matters to me" is what the app is built on, so a goal without a why is not allowed to exist. `obstacle` and `first_outcome` are optional.

Adding a `NOT NULL` column to a table that already has rows takes three statements: add it nullable, fill the existing rows, then set `NOT NULL`. Existing goals take the why from their owner's profile. Where there was none, they get the text `Not written yet.` There are no real users, so that placeholder can only appear on a goal in a developer's own database, created before this migration.

`usual_blocker` did not move as it was. The general "what gets in the way" is screen 4. A goal's `obstacle` is narrower: what might get in the way of *this* goal.

**2. A PATCH that changes only what is sent** (`update-goal.dto.ts`, `goals.repository.ts`)

An onboarding screen is saved whole, so it uses `PUT`. A goal is edited one field at a time: renamed in a list, its why rewritten on its page. That is what `PATCH` means:

| In the body | Result |
|---|---|
| field left out | unchanged |
| a value | replaced |
| `null` | cleared, for `obstacle` and `firstOutcome` only; `400` for `title` and `whyItMatters` |

It is one statement:

```sql
UPDATE goals
   SET title          = COALESCE($3::text, title),
       why_it_matters = COALESCE($4::text, why_it_matters),
       obstacle       = CASE WHEN $5::boolean THEN $6::text ELSE obstacle END,
       first_outcome  = CASE WHEN $7::boolean THEN $8::text ELSE first_outcome END
 WHERE id = $2 AND user_id = $1
 RETURNING …
```

Two different tricks, for a reason. The required answers cannot be cleared, so "not sent" can travel as `NULL` and `COALESCE` keeps the old value. The optional answers *can* be cleared, so `NULL` already means "clear it" and cannot also mean "not sent". Each of those travels as a pair: a flag saying whether it was sent, and the value.

In the DTO the same difference shows up as two decorators. `@IsOptional()` skips validation for a missing field **and for `null`**, which is right for the optional answers. For the required ones it would be wrong: `{ "title": null }` would pass validation and then be silently ignored. `@ValidateIf(value !== undefined)` skips only a field that is really absent, so `null` reaches `@IsString()` and is refused.

**3. The order rule moves** (`profile.service.ts`, `goals.service.ts`)

"The goal comes after the reflection" is still a backend rule. It used to guard `PUT /api/profile`; now `GoalsService.create` calls `ProfileService.requireOnboarded` first, which answers `409` with the missing screens. `ProfileModule` exports `ProfileService` and `GoalsModule` imports it: the one place that knows what "onboarded" means is asked, not copied.

No transaction is needed between the check and the insert. A screen cannot be deleted, so once the check passes for a user it passes forever; there is no gap for anything to slip through.

This also settles a question step 6 left open: a goal can no longer be created before onboarding, by any client.

**4. The profile without a direction** (`profile.service.ts`, `migrations/0006_direction-into-goals.sql`)

"Onboarding complete" used to be "the `profiles` row exists". Now it is "the six required screen rows exist", which the status query from step 5 already answers. No table, no column and no flag is needed for it.

`GET /api/profile` keeps its meaning, `404` until complete, and returns the seven screens at the top level. Migration `0006` first turns every saved direction into a goal, so nothing that was typed is lost, and then drops `profiles`.

**5. The examples in the API docs are tested** (`test/api-docs-examples.e2e-spec.ts`)

Every "Check it" section on this page says *Try it out → Execute*. For screen 7 that failed: Swagger pre-filled the list of picks by repeating its one example pick, and the API rightly refuses a value picked twice. A second defect was found on the way: sixteen optional text fields were published as type `object`, because a `string | null` property has no single runtime type and Swagger was left to guess.

The test reads the OpenAPI document, builds each request body the way Swagger UI builds it, and sends every one to the real API, in an order that works: register, log in, the screens, then goals. It also checks that every field with a text example is published as a string. Run against the code as it was, it fails with exactly the error from the browser.

**6. The tests**

| Rule | Test |
|---|---|
| A goal needs a why | `refuses to create with a missing why: 400, nothing saved` |
| No goal before the reflection | `refuses a goal until the reflection screens are saved: 409` |
| `PATCH` changes one field and leaves the rest | `renames a goal and leaves every other answer alone`, `rewrites the why alone` |
| `null` clears an optional answer | `clears an optional answer with null and keeps the one left out` |
| `null` is refused for a required answer | `refuses null for the title with 400 and changes nothing` |
| The profile is complete with six screens | `returns the seven screens once the six required ones are saved` |
| One missing screen keeps it incomplete | `answers 404 while one required screen is still missing` |
| The old route is gone | `has no PUT any more: the direction it saved is a goal now` |
| The docs tell the truth | `accepts every request example exactly as Swagger pre-fills it` |

### Check it

```bash
pnpm migrate up
pnpm test:e2e
```

`0005_goal-why` and `0006_direction-into-goals` are applied, and all 204 tests pass: 35 for goals, 7 for the profile, 5 for the onboarding status, 2 for the examples.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running):

1. **POST /auth/register** with a new email → *Execute*, so the browser has a cookie for a brand-new user.
2. **POST /goals** → `409`, six names under `missing`.
3. Under **onboarding**, save screens 2 to 7. Every pre-filled example is now accepted as it is, screen 7 included.
4. **GET /profile/onboarding** → `completed: true`. **GET /profile** → the seven screens, `basics: null`.
5. **POST /goals** → `201`, with `whyItMatters`. Copy the `id`.
6. **PATCH /goals/{id}** with only `{ "title": "A new title" }` → the why, obstacle and first outcome are unchanged.
7. **PATCH /goals/{id}** with `{ "obstacle": null }` → `obstacle: null`. With `{ "title": null }` → `400`.

---

## Step 8 — Every error carries a code

Steps 8 to 10 prepare the backend for two languages. The decision behind them is in `DECISIONS.md` (2026-10-04, *English and Arabic*): **the API speaks codes, the frontend speaks languages.** The backend never translates. It gives the frontend what it needs to translate.

Earlier sections on this page show error answers as they were when those steps were built, without `code`.

### Why

The app will be used in English and Arabic. Before this step, an error looked like this:

```json
{ "statusCode": 404, "error": "Not Found", "message": "Goal not found." }
```

To show that in Arabic, the frontend would have to recognise the English sentence. That fails in two ways:

- **Rewording breaks it.** Change `Goal not found.` to `This goal does not exist.` and the frontend no longer knows which error it is. A sentence is not a name.
- **Some sentences are not ours.** An id that is not a UUID answers `Validation failed (uuid is expected)`. An unknown route answers `Cannot GET /api/nothing`. NestJS writes those, and can change them in any release.

A code is a stable name. The frontend keeps one sentence per code in `en.json` and one in `ar.json`, and the sentence in the answer becomes what it always should have been: a note for the developer reading it.

What needs this later:

- **The frontend's API client (week 8)** turns a code into a sentence in the user's language.
- **Every module from Tasks on** adds its errors as codes from its first day. Now there were nine sentences in three modules to change; in week 7 there would have been thirty.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/common/api-error.ts` | Boundary | The list of every code, the `ApiError` exception, and `ApiErrorBody` for Swagger |
| `src/common/error-code.filter.ts` | Boundary | Writes every error answer in one shape; gives a code to the errors NestJS throws by itself |
| `src/app.setup.ts` | Setup | Registers the filter, for the real server and the e2e tests alike |
| `src/auth/auth.guard.ts`, `src/auth/auth.service.ts` | Guard, service | Three auth errors thrown by code |
| `src/auth/auth.module.ts` | Module | The rate-limit sentence is read from the list |
| `src/profile/profile.service.ts`, `src/profile/sections/sections.service.ts` | Service | Three profile errors thrown by code |
| `src/goals/goals.service.ts` | Service | Two goal errors thrown by code |
| `src/sessions/session-constraints.ts` | Constant | `HAS_WORK_HISTORY` removed: the sentence lives in the list now |
| `src/api-docs.ts` | Docs | Publishes `ApiErrorBody` and says what a code is for |
| `test/error-codes.e2e-spec.ts` | Test | An unknown route gets a code |
| Nine existing e2e files | Test | Each test that checks an error sentence also checks its code |

### How it works

**The answer now**

```json
{ "statusCode": 404, "error": "Not Found", "code": "goal.not_found", "message": "Goal not found." }
```

Nothing was taken away. `message` is word for word what it was, so Swagger reads the same as before.

**1. One list** (`api-error.ts`)

```ts
export const API_ERRORS = {
  'goal.not_found': { status: HttpStatus.NOT_FOUND, message: 'Goal not found.' },
  …
} as const satisfies Record<string, { status: HttpStatus; message: string }>;

export type ApiErrorCode = keyof typeof API_ERRORS;
```

| Code | Status | Sentence |
|---|---|---|
| `auth.not_logged_in` | 401 | Not logged in. |
| `auth.invalid_credentials` | 401 | Invalid email or password. |
| `auth.email_taken` | 409 | An account with this email already exists. |
| `profile.onboarding_not_done` | 404 | Onboarding is not done yet. |
| `profile.screen_not_saved` | 404 | This screen is not saved yet. |
| `goal.onboarding_required` | 409 | Finish these screens first. (with `missing`) |
| `goal.not_found` | 404 | Goal not found. |
| `goal.has_work_history` | 409 | This has work history. Archive the goal instead. |
| `bad_request` | 400 | whatever NestJS said |
| `not_found` | 404 | whatever NestJS said |
| `rate_limited` | 429 | Too many attempts. Try again in a minute. |

*Why one file, and not a constant in each module?* This list is the contract with the frontend: it is exactly the set of keys the translation files need under `errors`. One file can be read top to bottom when translating. It is the same pattern as `LIFE_VALUES`: the object exists at runtime, the type is derived from it, so the two cannot disagree.

*Why is the status in the list?* So a code cannot be sent with the wrong status. Nobody can throw `goal.not_found` as a 409 by mistake.

*How a code is named:* `feature.what_happened`, lower case. The last three have no feature because they belong to no module. **A code is never renamed once the frontend uses it.** The sentence can be reworded any day.

**2. Throwing one** (`ApiError`)

```ts
throw new ApiError('goal.not_found');
throw new ApiError('goal.onboarding_required', { missing });
```

Before, the 409 for a goal before onboarding spelled out `statusCode`, `error` and `message` by hand. Now the code is all a service names. The second argument adds fields to the answer, such as the `missing` screens, which were always codes (`selfView`, `values`) and need no change.

**3. The errors NestJS throws by itself** (`error-code.filter.ts`)

Three errors never pass through our services:

| Thrown by | When | Gets the code |
|---|---|---|
| `ParseUUIDPipe` | an id that is not a UUID | `bad_request` |
| The router | an unknown route under `/api` | `not_found` |
| `ThrottlerGuard` | the sixth register or login in a minute | `rate_limited` |

A *filter* is NestJS's name for the one function every error passes through on its way out. `ErrorCodeFilter` writes each answer in the same shape:

```ts
.json({
  statusCode: status,
  error: STATUS_CODES[status],        // "Not Found", from Node
  code: CODE_BY_STATUS[status],       // only if the error brought none
  ...(typeof body === 'string' ? { message: body } : body),
});
```

The exception's own fields are spread last, so they win. An `ApiError` keeps its code; a NestJS error gets one from its status. The sentence is never changed. Headers set before the error, such as `Retry-After` on a 429, stay.

*Why a filter, and not a fix at each of the three places?* Three places today, more with every pipe or guard added later. The filter is one place, and it also makes the shape the same everywhere: the 429 used to be the only error without an `error` field.

Until step 9, a body refused by a DTO also carries the general `bad_request`. Step 9 gives validation its own code and names the field.

**4. What has no code**

- **A crash (500).** It is a bug, not an answer, so it is not in the list. NestJS logs it and answers `Internal server error` as before.
- **A URL outside `/api`.** Express answers that with its own page before NestJS is involved. The frontend never calls one.

The frontend rule that covers both: *no code, or a code I do not know → show the general "something went wrong" sentence.* It needs that sentence anyway for when the network is down.

**5. In Swagger** (`api-docs.ts`)

`ApiErrorBody` describes the shape, and its `code` field lists every code. No route returns it as a success, so Swagger would not find the class by itself; `extraModels` adds it. It is at the bottom of the page under **Schemas**.

**6. The tests**

| Rule | Test |
|---|---|
| The full shape of an error | `answers 401, not 403, so the client knows to show the login page` |
| The extra fields survive | `refuses a goal until the reflection screens are saved: 409` |
| An unknown route gets a code | `gives an unknown route under /api the code not_found` |
| A bad id gets a code | `answers 400 for an id that is not a UUID` |
| The rate limit gets a code, and keeps `Retry-After` | `allows 5 login attempts a minute and refuses the 6th with 429` |
| The list in Swagger is the list in the code | `publishes the shape of an error and the list of error codes` |

### Check it

```bash
pnpm test:e2e
```

All 206 tests pass.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running):

1. **POST /auth/logout** → *Execute*, so the browser has no cookie. **GET /auth/me** → `401` with `"code": "auth.not_logged_in"`.
2. **POST /auth/register** with a new email → *Execute*. Press *Execute* again → `409` with `"code": "auth.email_taken"`.
3. **POST /goals** → `409` with `"code": "goal.onboarding_required"` and the six names under `missing`.
4. **PATCH /goals/{id}** with `00000000-0000-4000-8000-000000000000` as the id → `404` with `"code": "goal.not_found"`.
5. **PATCH /goals/{id}** with `abc` as the id → `400` with `"code": "bad_request"`.
6. Open <http://localhost:3001/api/nothing> in the browser → `"code": "not_found"`.
7. At the bottom of the Swagger page, **Schemas → ApiErrorBody → code** lists the eleven codes.
