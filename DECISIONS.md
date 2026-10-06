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
| Deferrable unique step position | a plain `UNIQUE (task_id, position)` | YOU-21 (reorder). **Changed in `0009_step-position-deferrable.sql`** to `DEFERRABLE INITIALLY IMMEDIATE`. |
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

## 2026-10-05 — Steps: the position stays in the database, and the time a step is done is the server's

Three choices made with YOU-20.

**The API does not return `position`.** A list of steps comes in order, and that order is all a client needs. A new step gets the highest position of its task plus one. Deleting a step in the middle leaves a gap (1, 3), which changes nothing about the order.

*Why not close the gap on delete?* Shifting the later steps down is an `UPDATE` over several rows, and the plain `UNIQUE (task_id, position)` is checked row by row: whether it passes depends on the order PostgreSQL happens to update them in. It becomes safe with the deferrable constraint that reordering brings (YOU-21). Until then, hiding the number costs nothing: reordering sends ids in order, not numbers.

**Adding a step locks the task row.** "Highest position plus one" is a read followed by a write. Two adds at the same moment would read the same highest position, and the unique constraint would refuse the second with a crash. `SELECT … FOR UPDATE` on the task makes the second add wait for the first. A test adds five steps at once; without the lock three of them fail.

*Why not catch the unique violation and try again?* A retry loop is more code, and it hides a collision instead of preventing it. The lock is one statement.

**`done` is a field of `PATCH /steps/:id`; the time is not.** The client sends `done: true` or `false`. The server writes `done_at`: now when the step was not done, unchanged when it already was, `NULL` for `false`. A `doneAt` in the body is refused like any unknown field.

*Why a field here, when archiving a goal got its own routes?* Archiving is an event with consequences for everything under the goal. Done is a checkbox, ticked and unticked many times a day, often in the same edit as a new title. The rule that matters is the same in both: the client says what happened, the server says when.

*Why keep the first time?* The progress page (week 5) counts steps finished per day from `done_at`. If marking a done step again moved the time, a double click late at night could move yesterday's work to today.

**The archived rule covers steps too.** Adding, renaming, marking and deleting a step answer 409 `goal.archived` while the goal is archived (see the entry above). `requireActive` moved to `src/goals/require-active.ts` so tasks and steps ask in one place.

## 2026-10-05 — Reordering steps: one list, one statement, a constraint checked when the statement ends

`PUT /api/tasks/:taskId/steps/order` takes `stepIds`, every step of the task once, in the wanted order, and answers with the steps in that order (YOU-21).

**Why the whole list, and not "move this step up"?** The client already knows the order it wants: the user dragged a step and let go. One list says it in one call. "Move up" three times is three calls, and if the second fails the order is one nobody chose.

**Why must the list be exactly the task's steps?** A step left out would keep its old position and could collide with a new one. A step from another task has no place in this order. So: every step, each once, nothing else, or `400` with `step.order_mismatch`. The reason is the same code for all cases, and an id from someone else's task is answered exactly like an id that does not exist.

**Why `DEFERRABLE INITIALLY IMMEDIATE`, when the issue says "deferred"?** All three variants were tried against PostgreSQL 16 before writing migration `0009`. A plain unique constraint is checked row by row and refuses a reorder halfway. A deferrable one is checked when the statement ends, which is enough, because the reorder is a single `UPDATE`. `INITIALLY DEFERRED` moves the check to the end of the *transaction*: in the trial a duplicate `INSERT` was accepted and the error came at `COMMIT`, far from the statement that made it. With "immediate", adding a step that collides still fails at its own `INSERT`.

**Why one `UPDATE`?** Either every step gets its new position or none does, without the code having to undo anything. Positions become 1 to n, so a gap left by a delete closes.

**The task is locked while it happens**, with the same lock an add takes. The steps the list was compared with are then still the task's steps when the order is written.

**The path says `:taskId`**, like the other step routes; the issue wrote `:id`. A task with no steps accepts an empty list.

**The one Swagger example that cannot be sent as it is.** The body must name the caller's own steps, so its pre-filled ids are refused with `400`. The examples test (2026-10-04) puts in the id its own `steps` example created, as a person would paste it by hand.

## 2026-10-06 — Starting a focus session: the index allows one, a done step is refused, an archive waits

`POST /api/sessions` takes `{ stepId }` and answers with the running session. `GET /api/sessions/active` returns it, or `404` (YOU-22). No migration: the table and its unique index exist since `0001`.

**One running session per user: the unique index decides, not a check.** The service does not ask "is a session running?" before the insert. PostgreSQL refuses the second running session (`one_active_session_per_user`, error `23505`), and that one named error becomes `409` `session.already_active`.

*Why:* a check followed by an insert has a gap, and a double click fits in it. A test sends two starts at once: one is `201`, the other `409`. The same choice as the unique email in register and the foreign key that protects work history.

**The step is read `FOR KEY SHARE` before the insert.** Tried against PostgreSQL 16 first: a step is deleted in one connection, not yet committed, and a session is started on it in another. A plain `INSERT` waits and then fails on `sessions_step_id_fkey`, which would reach the user as `500`. So does `INSERT … SELECT` from the step without a lock. With the step read `FOR KEY SHARE` first, the read waits and then finds no step: `404`. The lock lets a rename or a tick through; only a delete waits.

**A step that is done cannot be started: `409` `session.step_done`.** The issue was silent. Chosen on 2026-10-06, before building.

*Why:* done means done. If there is more to do, the step is not done: untick it, and the task shows `in_progress` while the timer runs, which is true. *Rejected: allow it.* One rule fewer, but a task could then read `done` with a session running on one of its steps.

The rule is about starting. Marking a step done while its session runs is allowed.

**The session answer names the step, the task and the goal**, each as `{ id, title }`.

*Why:* after a page reload the frontend has only `GET /sessions/active` to draw the timer screen from, and no route reads one step by its id. *Rejected: `stepId` only.* The smallest answer, but the timer screen could not say what you are working on without new routes. The titles are joined in when the answer is built, not copied into the session, so a rename shows in the next read. Both routes build the answer with the same statement.

**A goal cannot be archived while a session runs under it: `409` `goal.session_running`.** Also chosen on 2026-10-06, before building.

*Why:* an archived goal is read-only (2026-10-05), and a running session is a write still to come: ending it saves a review and can mark the step done. *Rejected: allow the archive.* Ending the session would then be the one write allowed under an archived goal. *Rejected: decide it with YOU-23.* The state would exist from the day sessions can be started.

*How:* the archive locks the goal `FOR UPDATE`, then asks for a running session in the next statement, then archives. A start holds the goal `FOR SHARE`, so each waits for the other. *Rejected: one statement,* `UPDATE goals … WHERE NOT EXISTS (a running session)`. Tried against PostgreSQL 16 with a start left uncommitted: the `UPDATE` waits for the goal, then archives it anyway, because a statement sees the database as it was when the statement began. The result was an archived goal with a session running under it. The lock must be its own statement.

*Cost:* archive was one statement and is now three in a transaction.

**Nothing running is `404` `session.none_active`**, as the issue says, not `200` with `null`. An onboarding screen that is not saved yet answers the same way, so a client reads "not there yet" in one way.

**The time is the server's.** `started_at` is the column's default, `now()`. A `startedAt` in the body is refused like any unknown field, for the same reason as a step's `doneAt`: the progress page counts minutes per day from it.

**The path is `/api/sessions`, with the step in the body**, as the issue says. The session is the thing created. And a user has one running session at most, so "the running one" needs no id: `/sessions/active`.

**Starting changes nothing else.** The step and the task's status are untouched. But the step is work history from the first second: it, its task and its goal answer `409` to a delete.
