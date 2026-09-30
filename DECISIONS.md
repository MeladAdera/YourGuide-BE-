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
| `users.timezone` | no timezone column | YOU-13 (register), YOU-24 (progress per local day) |
| A way to archive a goal | no archive column | YOU-18 |
| Deleting a goal/task/step with sessions is refused (409) | `ON DELETE CASCADE` deletes the sessions too | YOU-18, YOU-19, YOU-20 |
| Task status derived from its steps | a stored `tasks.status` column | YOU-19, YOU-20 |
| Deferrable unique step position | a plain `UNIQUE (task_id, position)` | YOU-21 (reorder) |
| Composite foreign keys for ownership | single-column foreign keys | No issue depends on it. Services check that the parent belongs to the user before inserting (YOU-19). |
| Review fields only on an ended session | no such check | YOU-23 |
