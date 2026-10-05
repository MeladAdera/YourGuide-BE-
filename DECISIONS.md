# Decisions

Every important decision, with the reason. Newest at the bottom.

## 2026-09-30 — Backend and frontend are two independent projects

`backend/` and `frontend/` live in one git repo but each has its own `package.json`, dependencies, lint config and scripts. There is no pnpm workspace and no shared package.

**Cost:** API types are not shared. The frontend declares the request/response types it uses, so a changed field is not caught at build time. This replaces the `packages/shared` plan in YOU-5, YOU-6, YOU-33, YOU-35 and YOU-36.

## 2026-09-30 — TypeScript 6.0, not 7.0

TypeScript 7 is the latest release, but `typescript-eslint` (needed for the strict lint rules) supports only `<6.1` and the Nest CLI pins `~6.0`. Move to 7 when both support it.

## 2026-09-30 — ES modules (NestJS 12)

NestJS 12 is published as ES modules, so the backend is `"type": "module"` with `module: nodenext`. Consequence: relative imports end in `.js` (`./app.module.js`), even though the file on disk is `.ts`.

## 2026-09-30 — Vitest instead of Jest

The plan said Jest. Jest still needs an experimental Node flag to run ES modules, and NestJS 12 is ES-module only; the official NestJS 12 starter ships Vitest. The test API is the same (`describe`, `it`, `expect`), and Supertest is unchanged.

## 2026-09-30 — ESLint `strictTypeChecked`, not the Nest default linter

The NestJS 12 starter ships oxlint with `no-explicit-any` turned off. We keep ESLint with `typescript-eslint` `strictTypeChecked`, because banning `any` and unsafe values is the point of YOU-6: with raw SQL there is no ORM to type query results for us.

## 2026-09-30 — Env files are loaded by the launcher, not by app code

`pnpm dev` and `pnpm migrate` pass `--env-file .env`; the e2e config loads `.env.test`; production gets real environment variables from the host. App code only reads `process.env` inside `src/config` (enforced by a lint rule), so there is one place where configuration can be wrong.

## 2026-09-30 — Unit tests and e2e tests are separate suites

- `pnpm test`: `src/**/*.spec.ts`, no database. Runs in the pre-push hook, so pushing never requires Docker.
- `pnpm test:e2e`: `test/**/*.e2e-spec.ts`, real app + `your_guide_test`. Tables are emptied before every test.

The e2e setup refuses to run unless the database name ends in `_test`, because it deletes all rows.

## 2026-09-30 — PostgreSQL 16 in Docker, host port 5433

The schema needs PostgreSQL 15+. 16 is supported by every hosting option we listed. Host port 5433 avoids clashing with other local PostgreSQL instances on 5432.

## 2026-09-30 — `steps.done_at TIMESTAMPTZ` instead of `steps.done BOOLEAN`

A step is done when `done_at IS NOT NULL`. The progress page shows "steps completed per day" (YOU-24), and a boolean cannot say on which day a step was finished. Marking a step as not done sets `done_at` back to `NULL`.

## 2026-09-30 — The database follows schema v1

`SCHEMA.md` is schema v1 with the one change above. `backend/migrations/0001_initial.sql` implements it exactly.

The Linear issues were written for a later draft (v1.3) that is not in the repo. Where an issue needs something v1 does not have, we add a **new migration at that step** and update `SCHEMA.md` with it. We do not edit `0001_initial.sql`.

| The issue expects | Schema v1 has | First needed in |
|---|---|---|
| `users.timezone` | no timezone column | YOU-13 (register), YOU-24 (progress per local day). **Added in `0002_add-user-timezone.sql`.** |
| A way to archive a goal | no archive column | YOU-18. **Added in `0004_goal-archive-and-work-history.sql`** (`goals.archived_at`). |
| Deleting a goal/task/step with sessions is refused (409) | `ON DELETE CASCADE` deletes the sessions too | YOU-18, YOU-19, YOU-20. **Changed in `0004`** for all three: `sessions.step_id` has no ON DELETE action. |
| Task status derived from its steps | a stored `tasks.status` column | YOU-19, YOU-20. **Dropped in `0008_drop-task-status.sql`**; the status is read from the steps. |
| Deferrable unique step position | a plain `UNIQUE (task_id, position)` | YOU-21 (reorder) |
| Composite foreign keys for ownership | single-column foreign keys | No issue depends on it. Services check that the parent belongs to the user before inserting (YOU-19). |
| Review fields only on an ended session | no such check | YOU-23 |

## 2026-10-01 — Rate limit per IP, counted in memory; proxies trusted only via `TRUST_PROXY`

Register and login allow 5 requests a minute per IP (`@nestjs/throttler`, YOU-16). The counters live in the Node process: a restart forgets them, and two copies of the API would each count on their own. A shared store (Redis) is added only when there is a second copy.

The limit needs the real client IP. Behind a proxy (hosting platform, Next.js rewrites) Express sees the proxy's IP unless told how many proxies to trust. That is `TRUST_PROXY` (default `0`). It is not always on, because `X-Forwarded-For` is just a header: with no proxy, anyone could pick their own IP and the limit would count nothing. The value is decided at deploy time, when hosting is chosen.

Logout is public (YOU-15), although the issue listed only register, login and health. A browser with an expired or stale cookie must still be able to log out and clear it; "already logged out" is a success.

## 2026-10-03 — Onboarding is eight screens, and the goal comes last

The profile grew from three answers (goal, why, usual blocker) to eight screens: basics, your days now, what you have done, what gets in the way, how you see yourself, a quick confidence check-in, what matters to you, and only then your direction (goal, why, usual blocker, first outcome). `PROJECT.md` §6.1 lists the questions.

**Why last:** asked first, the goal is whatever the person walked in with. After recalling evidence of what they can do, naming what they avoid and choosing what matters, the goal they write is more specific and more their own, and the "why" is half-written already. Values before plans, and a definite aim with a real why, are the two principles we take from the goal-setting literature behind the app, in our own words and questions.

**Two ordering choices worth knowing:** "How you see yourself" sits fifth, not third, because people describe themselves better right after recalling concrete achievements and patterns (concrete before abstract). The check-in sits sixth because eight taps are a rest after the heaviest writing, and lead into values.

**Required vs optional:** nine written answers are required in all; every other question is a tap or optional, and the more personal questions (a regret, what others come to you for) are the optional ones. Screen 1 can be skipped entirely. Screens 2–7 must exist before screen 8 is accepted: the backend answers 409 otherwise, because the order is a product rule and "all business logic lives in NestJS" (`PROJECT.md` §4).

**Cost:** onboarding takes ten to fifteen minutes instead of two, and nothing in the app works until it is done. We accept that: the advice the app gives later is only as good as what it knows.

**Changed 2026-10-04:** screen 8 is no longer a profile screen. It is the first goal, created with `POST /api/goals`, and the 409 moved there. See the entry of that date.

## 2026-10-03 — One table per onboarding screen

Each of screens 1–7 is its own table (`profile_basics` … `profile_meaning`, plus `profile_values` for the picks); screen 8 stays in `profiles`, which gains `first_outcome` and `completed_at`. Migration `0003_onboarding-sections.sql`; `SCHEMA.md` §5.

**Why:** a screen can be saved on its own; "required on this screen" is `NOT NULL`; "screen done" is "row exists"; each table reads in one look.

**Rejected:** one wide `profiles` with about forty nullable columns (required would live only in code, and one forty-field DTO); a generic `profile_answers (question_key, answer)` table and JSONB per screen (both take the rules out of the database, against every decision above).

**Cost:** eight similar tables, the same upsert written eight times, and a full profile read that touches all of them. Adding a question is a migration plus a DTO field, which is what we want: the question list is part of the schema, not data.

**Changed 2026-10-04:** the `profiles` table was dropped (migration `0006`); its rows became goals. The seven screen tables and `profile_values` are unchanged.

## 2026-10-03 — The check-in stores answers, never a score; the app never diagnoses

`profile_confidence` holds eight answers from 1 to 5 and nothing derived. Two of the ten proposed statements were dropped: "I trust myself to make important decisions" (ties to no feature) and "my past mistakes define me" (the closest to a clinical screening item, and it invites shame). If week 6 needs a signal such as "compares a lot", it is a pure function over the raw answers, written and unit-tested then, and it names a behaviour, never a condition.

The rule applies to the whole app: it never says or stores "you have depression / low self-esteem / anxiety", in a response, a prompt or a column. Reflection answers are personalisation signals.

## 2026-10-03 — What onboarding deliberately does not collect

City, address, birthdate, languages, field of study, gender, health. The test for every field was "which feature reads it?"; these had no answer. Age is a range and location is a two-letter country code, both optional. Free-text answers are the most sensitive data in the app: they go only to the user and to the backend's AI call, never into logs or error messages.

## 2026-10-04 — Work history cannot be deleted: the foreign key refuses, the API answers 409

Planning (goals, tasks, steps) can be deleted; a focus session cannot, because it is the proof of progress the app exists to show. Schema v1 cascaded a goal delete all the way through its sessions. Migration `0004_goal-archive-and-work-history.sql` removes `ON DELETE CASCADE` from `sessions.step_id` only. PostgreSQL then refuses to delete a step that has sessions (error 23503), and with it the task or goal whose delete would cascade to that step. The service turns that one error into `409` "This has work history. Archive the goal instead." (YOU-18; tasks and steps reuse it in YOU-19 and YOU-20. Since 2026-10-05 a task answers with its own code and sentence: see that entry.)

**Why not a check in the service?** "Does it have sessions?" followed by a delete has a gap between the two statements. The foreign key has none, and it is one statement instead of two. This is the same choice as the unique email index in register.

**Why "no action" and not `RESTRICT`?** The risk was deleting a *user*, which cascades to their steps and to their sessions in one statement. Both variants were tried against the real database (PostgreSQL 16) before writing the migration: both refuse the goal delete, and both let the user delete through. "No action" is checked at the end of the statement, when the sessions are gone too. We keep it because it is the default (a plain `REFERENCES`, nothing extra to remember) and the one that could be deferred if ever needed. A schema test, *deleting a user still deletes everything, sessions included*, protects the behaviour we rely on.

**Cost:** a delete can now fail for a reason the client must handle. The message names the way out, and the goals screen (YOU-39) offers Archive on a 409.

## 2026-10-04 — `goals.archived_at` is a timestamp; archive and unarchive are their own routes

`archived_at TIMESTAMPTZ`, `NULL` while active, the same shape as `steps.done_at`: one column answers "is it archived?" and "since when?". Archiving twice keeps the first timestamp (`COALESCE`), so the call is safe to repeat.

`POST /goals/:id/archive` and `/unarchive`, not `PATCH` with an `archived` field: archiving is something that happens to a goal, with its own rule, not a value the client sets. `PATCH /goals/:id` stays "rename" and nothing else.

A goal is not linked to the profile in the database. (This entry first described a separate "direction" on the profile. That was removed the same day: see the next entry.)

## 2026-10-04 — Screen 8 is the first goal; every goal carries its own why

Found by using the API, one day after building it. With the seven screens saved and a goal created, `PUT /api/profile` ("screen 8, your direction") asked for a goal, a why and a blocker again. Every field on screen 8 described a goal, not the person, and `goals` already existed: two homes for one thing. The cause: the three original profile fields were kept as "screen 8" so the old route would not break, and then goals arrived with their own title.

**Now:** `goals` has `why_it_matters` (required), `obstacle` and `first_outcome` (optional). The wizard's last step is `POST /api/goals`, the same call as for every later goal. `PUT /api/profile` and the `profiles` table are gone; migrations `0005` and `0006` turned every saved direction into a goal first. The profile is the seven screens about the person, and onboarding is complete when the six required ones are saved.

**The order rule moved; it did not go away.** `POST /api/goals` answers 409 with the missing screens until onboarding is complete. That also settles the question left open in `PROJECT.md` §12: the backend, not only the frontend, refuses a goal before the reflection.

**Why a why per goal:** before, only the profile had one, so a second goal had none and advice for it would have used the wrong why. `usual_blocker` became the optional `obstacle` of a goal: the general "what gets in the way" is screen 4; this is what might get in the way of *this* goal.

**`PATCH /api/goals/:id` changes only what is sent.** A goal is edited one field at a time, unlike a screen, which is saved whole with `PUT`. Left out means unchanged; `null` clears an optional answer and is refused for a required one.

**Cost:** part of the previous day's work was rebuilt (the 409 on the profile, `completed_at`, the nested `sections` in `GET /api/profile`). `completed_at` went with the table; nothing read it. Before tasks and the frontend build on goals was the cheap moment to do it.

**Lesson kept:** the overlap was invisible in the design and obvious in the first five minutes of use. Try each step through Swagger as a user would before building the next one on top of it.

## 2026-10-04 — Every example in the API docs is sent to the API by a test

The "Check it" steps in `docs/` say *Try it out → Execute*. For screen 7 that failed: the list of picks had no example of its own, so Swagger repeated the one example pick, and the API rightly refuses a value picked twice. Sixteen optional text fields were also published as `object`, because a `string | null` property has no single runtime type.

`test/api-docs-examples.e2e-spec.ts` builds each request body the way Swagger UI does and sends it to the real API, and checks that a field with a text example is published as a string. Run against the code as it was, it reproduces both defects. A list field gets its own `example`; `@Answer` states `type: String`.

## 2026-10-04 — English and Arabic: the API speaks codes, the frontend speaks languages

The app will be used in English and Arabic. There are three kinds of text, and each has one home:

| Kind | Examples | Who writes it in the user's language |
|---|---|---|
| App text | buttons, the onboarding questions, option labels, error sentences | The frontend, from one file per language |
| User text | answers, goal titles, notes | Nobody. It is stored and shown as written |
| AI text | advice, suggested steps | The backend's AI call, the only place the backend writes for a person |

So the backend never translates. It answers with codes: an error has a `code` (`goal.not_found`), a fixed list is codes (`family`, `between_jobs`, which they already were), and the database stores codes and what the user wrote. The English sentence stays in every error for the developer reading it.

**Rejected: translating in the backend** (`nestjs-i18n`, the request's `Accept-Language`). Buttons and labels must live in the frontend anyway, so wording would have two homes that must be kept in step. With codes there is one file per language, and a test checks a code, which does not break when a sentence is reworded.

**Rejected: translation tables in the database.** The question list is part of the schema, not data (2026-10-03); its wording in each language is part of the frontend, for the same reason.

**Cost:** the two projects share no code, so the frontend's list of codes can fall behind the backend's. A code the frontend does not know gets its general "something went wrong" sentence, and Swagger publishes the full list. And a code can never be renamed once the frontend uses it.

**What has no code:** a crash (500). It is a bug, not an answer.

**The order of work:** the backend first, before Tasks, while there were nine sentences to change: a code on every error (YOU-54), validation errors that name the field and the rule (YOU-55), the user's language on the account for the AI (YOU-56). The AI writes in that language in week 6. The frontend gets its translation files and right-to-left layout in week 8, with its first component.

## 2026-10-04 — The user's language is stored on the account (`users.locale`)

`users.locale` is `en` or `ar`: required, no default, a CHECK constraint. The browser sends it at register, next to `timezone`. `PATCH /api/auth/me` changes it. Migration `0007_add-user-locale.sql`; existing users got `en`.

**Why store it, when the frontend does the translating?** Two readers. The AI call (week 6) is the one place the backend writes text for a person, and it must write in the language that person reads. And the frontend: a choice kept only in a browser cookie is lost on the next device.

**This does not undo "we do not collect languages"** (2026-10-03). That rule is about the languages a person speaks, a fact about them that no feature reads. This is the app's display language, a setting, and it passes the same test: two features read it.

**Required at register, not optional with a default.** The frontend always knows which language it is showing, so it can always say. A default in the database would turn a forgotten field into English without anyone noticing. Same choice as `timezone`.

**Not read from the request's `Accept-Language` header.** The backend translates nothing, so it has no use for the language of one request. It needs the language of the *person*, at the moment the AI writes to them.

**`PATCH /api/auth/me` takes only `locale`.** Changing the timezone or the email are separate decisions with their own questions (which day does yesterday's session belong to? is the new email taken?). They are not part of this work.

**Cost:** a third language is three changes that must agree: a migration for the CHECK, `SUPPORTED_LOCALES`, and a translation file in the frontend. That is the same price every option list in this schema pays.

## 2026-10-05 — A task's status is read from its steps, never stored

Schema v1 had `tasks.status` (`todo`, `in_progress`, `done`). Migration `0008_drop-task-status.sql` removes it. The status is computed in the query that reads the task (`SCHEMA.md` §7):

| The steps | The status |
|---|---|
| No step done, or no steps yet | `todo` |
| Some done, not all | `in_progress` |
| Every step done | `done` |

**Why:** a stored status is a second copy of what the steps already say. Something must then keep the two in step every time a step is marked, unmarked, added or deleted, and the day that code misses a case the app shows a finished task as unfinished. Read from the steps, the status cannot be wrong, and "a task is done automatically when all its steps are done" (`PROJECT.md` §6.2) needs no code.

**Rejected: keep the column and update it in the steps service.** Four places to remember (done, undone, add, delete), each in the same transaction as the step change. **Rejected: a trigger.** It moves the same bookkeeping into the database, where it is harder to read and test.

**What follows from the rule:** adding a step to a finished task makes it `in_progress` again, which is true. A task with no steps is `todo`. Starting a focus session does not change the status; only finished steps do.

**The status cannot be sent.** `POST` and `PATCH` refuse a `status` field with 400, like any unknown field.

**Cost:** one small inner query per task in a list, kept cheap by `steps_task_idx`. The column had never been written by any code, so nothing was lost.

## 2026-10-05 — An archived goal is read-only; every write under it locks the goal first

While a goal is archived, nothing under it changes. Adding a task, renaming one and deleting one all answer `409` `goal.archived`. Listing its tasks works. Unarchive the goal and every change is accepted again.

**Why:** archiving means "I have put this away". A task that can still be renamed or deleted inside something put away is a surprise, and "read-only until unarchived" is one rule a person can keep in their head. The issue asked for the 409 on create only; we chose the wider rule after building it, on 2026-10-05. Steps (YOU-20) follow the same rule.

**Not covered:** the goal's own routes. An archived goal can still be renamed, unarchived, or deleted when it has no work history.

**The two questions, in this order:** is it yours (404), and is it active (409)? 404 comes first so that someone else's archived goal answers exactly like one that does not exist.

**Why a check in the service this time?** For deletes we let a foreign key decide. Here no constraint can: `tasks.goal_id` proves the goal exists, not whose it is, and "not archived" is not something a foreign key knows. (The composite foreign keys of the later schema draft would cover ownership; we do not have them.)

**Why a transaction with `FOR SHARE`?** A check followed by a write has a gap. In it the goal could be archived, and the change would land in an archived goal; or deleted, and an insert would crash with a foreign-key error. `SELECT … FOR SHARE` makes an archive or a delete of that goal wait until the write has committed, so the check and the write see the same goal. It runs in `withTransaction`, the helper register and screen 7 already use.

**Cost:** renaming or deleting a task is now two statements in a transaction instead of one. The lock is on the goal, not the task, so the write still handles "no row" as 404.

**A task with history has its own code.** Deleting it answers 409 `task.has_work_history`, not the goal's `goal.has_work_history`. The cause is the same foreign key, but the frontend needs a sentence about a task, and a task has no "archive it instead". The 2026-10-04 entry planned to reuse the goal's sentence; that was before errors had codes.
