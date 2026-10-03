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
| A way to archive a goal | no archive column | YOU-18 |
| Deleting a goal/task/step with sessions is refused (409) | `ON DELETE CASCADE` deletes the sessions too | YOU-18, YOU-19, YOU-20 |
| Task status derived from its steps | a stored `tasks.status` column | YOU-19, YOU-20 |
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

## 2026-10-03 — One table per onboarding screen

Each of screens 1–7 is its own table (`profile_basics` … `profile_meaning`, plus `profile_values` for the picks); screen 8 stays in `profiles`, which gains `first_outcome` and `completed_at`. Migration `0003_onboarding-sections.sql`; `SCHEMA.md` §5.

**Why:** a screen can be saved on its own; "required on this screen" is `NOT NULL`; "screen done" is "row exists"; each table reads in one look.

**Rejected:** one wide `profiles` with about forty nullable columns (required would live only in code, and one forty-field DTO); a generic `profile_answers (question_key, answer)` table and JSONB per screen (both take the rules out of the database, against every decision above).

**Cost:** eight similar tables, the same upsert written eight times, and a full profile read that touches all of them. Adding a question is a migration plus a DTO field, which is what we want: the question list is part of the schema, not data.

## 2026-10-03 — The check-in stores answers, never a score; the app never diagnoses

`profile_confidence` holds eight answers from 1 to 5 and nothing derived. Two of the ten proposed statements were dropped: "I trust myself to make important decisions" (ties to no feature) and "my past mistakes define me" (the closest to a clinical screening item, and it invites shame). If week 6 needs a signal such as "compares a lot", it is a pure function over the raw answers, written and unit-tested then, and it names a behaviour, never a condition.

The rule applies to the whole app: it never says or stores "you have depression / low self-esteem / anxiety", in a response, a prompt or a column. Reflection answers are personalisation signals.

## 2026-10-03 — What onboarding deliberately does not collect

City, address, birthdate, languages, field of study, gender, health. The test for every field was "which feature reads it?"; these had no answer. Age is a range and location is a two-letter country code, both optional. Free-text answers are the most sensitive data in the app: they go only to the user and to the backend's AI call, never into logs or error messages.
