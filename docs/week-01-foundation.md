# Week 1 — Foundation

This week has no features. The goal is a place where features can be built **safely**: mistakes are caught by the compiler, the linter, the git hooks, or a test, before they reach the app.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Project structure](#step-1--project-structure) | YOU-5 | Done |
| 2 | [Type safety](#step-2--type-safety) | YOU-6 | Done |
| 3 | [Git hooks](#step-3--git-hooks) | YOU-7 | Done |
| 4 | [NestJS app + typed config](#step-4--nestjs-app--typed-config) | YOU-8 | Done |
| 5 | [PostgreSQL in Docker](#step-5--postgresql-in-docker) | YOU-9 | Done |
| 6 | [Database module](#step-6--database-module) | YOU-10 | Done |
| 7 | [Health endpoint + e2e tests](#step-7--health-endpoint--e2e-tests) | YOU-12 | Done, one part moved to week 2 |
| — | [Initial migration](#not-finished-yet) | YOU-11 | Not started (needs `SCHEMA.md`) |

All commands on this page run inside `backend/`.

---

## Step 1 — Project structure

### Why

Every other step puts files somewhere, so the folders come first.

The first plan was a pnpm monorepo with a shared types package. We changed it: the backend and the frontend are **two independent projects** in one git repo.

- What this gives us: each project has its own dependencies and scripts, and can be installed, tested, and deployed alone.
- What it costs: the two projects share no code. The frontend will write its own types for the API responses.

### What we built

```
your-guide/
├── backend/            # NestJS API — this week
│   ├── src/            # application code
│   ├── test/           # e2e tests
│   ├── migrations/     # SQL migrations (empty for now)
│   └── package.json
├── docs/               # this folder
├── PROJECT.md
├── DECISIONS.md
└── .gitignore
```

`frontend/` is added in week 8.

### How it works

Three lines in `backend/package.json` matter:

| Line | Meaning |
|---|---|
| `"type": "module"` | The backend uses ES modules, because NestJS 12 does. Imports of our own files end in `.js` (`./app.module.js`), even though the file on disk is `.ts`. |
| `"packageManager": "pnpm@…"` | Everyone uses the same pnpm version. |
| `"engines": { "node": ">=24" }` | The tools we use need a recent Node.js. |

`.gitignore` keeps `node_modules/`, `dist/`, and `.env` out of git. `.env` can hold secrets, so it is never committed. `.env.example` and `.env.test` are committed, because they hold only local Docker values.

### Check it

```bash
pnpm install
```

It finishes without errors.

---

## Step 2 — Type safety

### Why

We use raw SQL with no ORM. Nothing checks the result of a query for us.

The most common bug with raw SQL is this:

```ts
const user = rows[0];
return user.id; // crashes if no row was found
```

"No row found" is not a rare case in this app. It is how the ownership rule works: a row that belongs to another user is treated as not found (404). So we want the compiler to force us to handle it, every time.

We turn these rules on in week 1, when there is no code. Turning them on in week 5 would mean fixing hundreds of errors at once.

### What we built

| File | Purpose |
|---|---|
| `tsconfig.json` | Compiler rules |
| `eslint.config.js` | Lint rules |
| `.prettierrc`, `.prettierignore` | Code formatting |
| `src/struggles/situation.ts` | The list of struggle situations |
| `src/sessions/session-outcome.ts` | The list of session outcomes |

### How it works

**Compiler (`tsconfig.json`)**

| Option | What it catches |
|---|---|
| `strict` | `null` and `undefined` must be handled; no hidden `any` |
| `noUncheckedIndexedAccess` | `rows[0]` has type `Row \| undefined`, so you must check it before use |
| `noImplicitOverride` | Overriding a parent method by accident |
| `noFallthroughCasesInSwitch` | A `switch` case that forgot `break` or `return` |

**Linter (`eslint.config.js`)**

We use `typescript-eslint` with the `strictTypeChecked` rules. The most important ones:

- `no-explicit-any` — you cannot write `any`.
- `no-unsafe-*` — you cannot use a value that is `any` (for example, an untyped query result).
- `no-floating-promises` — you cannot forget `await`.

We added two rules of our own:

- A class that only has a decorator is allowed. NestJS modules look like this.
- `process.env` is forbidden in `src/`, except in `src/config/`. See step 4.

**Formatter (Prettier)**

Prettier decides the formatting, so we never think about it. ESLint's formatting rules are turned off so the two tools do not disagree.

**The two lists**

```ts
export const SITUATIONS = ['stuck', 'tired', 'comparing', 'negative_thought'] as const;
export type Situation = (typeof SITUATIONS)[number];
```

The array exists when the app runs, so we can use it to validate a request. The type is built *from* the array, so the two can never disagree. These lists must match the `CHECK` constraints in `SCHEMA.md`.

### Check it

```bash
pnpm typecheck
pnpm lint
pnpm format:check
```

All three pass.

To see the rules work, create a file `src/try.ts`:

```ts
const x: any = 1;
export const y = x;

const rows: { id: string }[] = [];
export const id = rows[0].id;
```

- `pnpm lint` fails with `Unexpected any` (`no-explicit-any`).
- `pnpm typecheck` fails with `Object is possibly 'undefined'`.

Delete the file after.

---

## Step 3 — Git hooks

### Why

The rules from step 2 only help if they run.

We work alone. There is no reviewer, and there is no CI until week 7. The git hooks are the only thing that stops broken code from reaching `main` on a tired evening.

### What we built

| File | Runs when | What it does |
|---|---|---|
| `.husky/pre-commit` | `git commit` | ESLint `--fix` and Prettier, on the **staged files only** |
| `.husky/pre-push` | `git push` | Type check and unit tests, on the **whole backend** |

The list of files and commands for pre-commit is the `lint-staged` section of `package.json`.

### How it works

- **pre-commit is fast.** It checks only the files you are committing, so it takes a few seconds. A slow hook gets skipped; a fast one does not.
- **pre-push is thorough.** A type error can be in a file you did not touch, so it checks everything.
- **e2e tests are not in the hooks.** They need Docker to be running. Pushing should not depend on that.

One detail: the git repo root is `your-guide/`, but Husky is installed in `backend/`. So the `prepare` script is `cd .. && husky backend/.husky`, and each hook starts with `cd backend`. `prepare` runs by itself after `pnpm install`.

### Check it

Create `src/try.ts` with `export const x: any = 1;`, then:

```bash
git add src/try.ts
git commit -m "test"
```

The commit is blocked with `Unexpected any`. Remove the file with `git rm -f --cached src/try.ts && rm src/try.ts`.

---

## Step 4 — NestJS app + typed config

### Why

Our rule is **fail fast**.

Think about a missing `DATABASE_URL`. The worst result is an app that starts fine and then fails on the first real request, maybe in production. We want the opposite: the app refuses to start and says exactly what is missing.

So all environment variables are read **once**, at startup, into one typed object. The rest of the code never touches `process.env`. When configuration is wrong, there is one place to look.

The `ValidationPipe` follows another rule: **validate only at the boundaries**. A bad request is rejected before it reaches a service, so services can trust their input.

### What we built

| File | Purpose |
|---|---|
| `src/main.ts` | Starts the server |
| `src/app.module.ts` | The root module: lists every feature module |
| `src/app.setup.ts` | HTTP settings shared by the server and the e2e tests |
| `src/config/app-config.ts` | Reads and checks the environment variables |
| `src/config/config.module.ts` | Makes `AppConfig` available everywhere |
| `src/config/app-config.spec.ts` | Unit tests for the config |
| `.env.example` | The variables the backend needs |

### How it works

**Config**

| Variable | Required | Default |
|---|---|---|
| `DATABASE_URL` | Yes | — |
| `PORT` | No | `3001` (the frontend will use 3000) |

`AppConfig` is a class. NestJS creates it once at startup. If `DATABASE_URL` is missing or `PORT` is not a valid port, the constructor throws and the app exits.

Any class can then ask for it:

```ts
constructor(private readonly config: AppConfig) {}
```

The lint rule from step 2 makes `process.env` an error everywhere else in `src/`.

**Where the values come from**

App code does not load `.env` files. The thing that starts the app does:

| Situation | Source |
|---|---|
| `pnpm dev` | `.env` (passed with `--env-file`) |
| `pnpm test:e2e` | `.env.test` |
| Production | Real environment variables from the host |

**HTTP settings (`app.setup.ts`)**

- Every route starts with `/api`.
- `whitelist: true` — only fields declared in the DTO are accepted.
- `forbidNonWhitelisted: true` — a request with an unknown field gets `400`, instead of the field being dropped silently.

These settings are in their own function because the e2e tests build the app without `main.ts`. Both call `configureApp`, so the tests run against the same settings as the real server.

### Check it

```bash
pnpm test
```

The `AppConfig` tests pass.

```bash
pnpm build
env -u DATABASE_URL node dist/main.js
```

The app exits with:

```
Error: Missing required environment variable: DATABASE_URL. Copy backend/.env.example to backend/.env and set it.
```

---

## Step 5 — PostgreSQL in Docker

### Why

The most important rules of this app live in the database: one active session per user, every row belongs to a user, deleting must not destroy history. A fake database cannot test those rules. We need a real PostgreSQL.

Docker gives us the same PostgreSQL version every time, with one command, and installs nothing on the machine.

There are **two databases** because the e2e tests delete all rows before every test. If they used the development database, running the tests would delete our own goals and sessions.

### What we built

| File | Purpose |
|---|---|
| `docker-compose.yml` | One PostgreSQL 16 container |
| `docker/postgres-init/01-create-test-db.sql` | Creates the second database |
| `.env.example` | Connection string for development |
| `.env.test` | Connection string for the e2e tests |

### How it works

| Setting | Value |
|---|---|
| Host and port | `localhost:5433` |
| User / password | `your_guide` / `your_guide` |
| Development database | `your_guide_dev` |
| Test database | `your_guide_test` |

- **Port 5433**, not 5432, so it does not clash with another PostgreSQL on the machine. Inside the container PostgreSQL still uses 5432.
- **PostgreSQL 16**: the schema needs version 15 or newer.
- **The data is kept in a Docker volume**, so it survives `docker compose down`.
- **The init script runs only once**, when the volume is first created. To start again from nothing: `docker compose down -v` (this deletes all data).

### Check it

```bash
docker compose up -d --wait
docker compose exec postgres psql -U your_guide -d your_guide_dev -c '\l'
```

The list shows both `your_guide_dev` and `your_guide_test`.

---

## Step 6 — Database module

### Why

Two reasons.

**One pool.** Opening a database connection is slow. The app opens a small set of connections once (a pool), shares them, and closes them cleanly when it stops.

**All or nothing.** Some features change more than one row. Ending a session with outcome `done` must save the review, mark the step done, and maybe mark the task done. If the second write fails after the first one succeeded, the progress data is wrong forever. A transaction makes the writes succeed together or fail together.

We build and test this now, before any feature depends on it.

### What we built

| File | Purpose |
|---|---|
| `src/database/database.service.ts` | The pool, `withTransaction`, `ping` |
| `src/database/database.module.ts` | Makes `DatabaseService` available everywhere |
| `test/database.e2e-spec.ts` | Proves commit, rollback, and release |

### How it works

**`withTransaction`**

```ts
const client = await this.pool.connect();
try {
  await client.query('BEGIN');
  const result = await work(client);
  await client.query('COMMIT');
  return result;
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

- If `work` finishes, the changes are saved (`COMMIT`).
- If `work` throws, every change is undone (`ROLLBACK`) and the error continues up.
- The connection always goes back to the pool (`finally`). A connection that is never released is lost, and after a few of those the app stops answering.

**The rule for repositories**

Every repository method takes an `Executor` as its first argument. An `Executor` is the pool or a transaction client. So the same method works alone or inside a transaction:

```ts
// alone
await this.stepsRepository.markDone(this.db.pool, userId, stepId);

// inside a transaction
await this.db.withTransaction(async (client) => {
  await this.sessionsRepository.end(client, userId, sessionId, review);
  await this.stepsRepository.markDone(client, userId, stepId);
});
```

(These repositories do not exist yet. This shows how later weeks will use the helper.)

**Shutdown**

`DatabaseService` closes the pool when the app stops. `main.ts` calls `enableShutdownHooks()`, so this also happens on Ctrl+C.

### Check it

```bash
pnpm test:e2e
```

The three `withTransaction` tests pass. The important one inserts a row, throws an error, and then checks that the table is empty.

---

## Step 7 — Health endpoint + e2e tests

### Why

**Health endpoint.** `GET /api/health` is the smallest request that uses the whole path: HTTP → NestJS → pool → PostgreSQL. If it answers, everything is connected. The deploy in week 7 will also call it to know the API is alive.

**E2E tests.** Our rule is: a week is done when its "Done when" list passes as tests. So every later week depends on tests we can trust. A test we can trust starts from an empty database and does not depend on what another test left behind.

### What we built

| File | Purpose |
|---|---|
| `src/health/health.controller.ts` | `GET /api/health` |
| `src/health/health.module.ts` | The health module |
| `src/health/health.controller.spec.ts` | Unit tests (database up / database down) |
| `vitest.config.ts` | Unit test settings |
| `vitest.config.e2e.ts` | E2E test settings |
| `test/setup/global-setup.ts` | Runs the migrations once |
| `test/setup/clean-database.ts` | Empties all tables before every test |
| `test/setup/test-database-url.ts` | Refuses any database not named `*_test` |
| `test/helpers/create-test-app.ts` | Builds the real app for a test |
| `test/health.e2e-spec.ts` | The health e2e test |

### How it works

**The endpoint**

It runs `SELECT 1`. If the database answers, it returns `200 {"status":"ok"}`. If not, it returns `503`.

**Two test suites**

| | Unit tests | E2E tests |
|---|---|---|
| Command | `pnpm test` | `pnpm test:e2e` |
| Files | `src/**/*.spec.ts` | `test/**/*.e2e-spec.ts` |
| Database | None | `your_guide_test` |
| Needs Docker | No | Yes |
| Runs in the pre-push hook | Yes | No |

**What happens in an e2e run**

1. The config loads `.env.test`.
2. The migrations run once, so the test database has the newest schema.
3. Before **every** test, all tables are emptied.
4. Test files run one after another, never at the same time, because they share one database.

**The safety check**

Emptying the tables deletes all rows. So the setup reads the database name and stops unless it ends in `_test`. Running the tests against the development database gives:

```
Error: Refusing to run e2e tests against "your_guide_dev": the database name must end with _test.
```

### Check it

```bash
pnpm test:e2e
pnpm test:e2e
```

Both runs pass with the same result.

```bash
pnpm dev
curl http://localhost:3001/api/health
```

The answer is `{"status":"ok"}`.

---

## Not finished yet

| What | Why not | When |
|---|---|---|
| Initial migration with all 8 tables (YOU-11) | It must follow `SCHEMA.md` exactly, and that file is not in the repo yet. The tool is ready: `pnpm migrate up`. | As soon as `SCHEMA.md` is added |
| Test helper: create a user + logged-in agent (part of YOU-12) | It needs the register and login endpoints. | Week 2 |

## Commands

| Command | What it does |
|---|---|
| `docker compose up -d --wait` | Start PostgreSQL |
| `pnpm dev` | Start the API and restart on changes |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run the compiled app (the environment variables must already be set) |
| `pnpm typecheck` | Type check |
| `pnpm lint` | Lint |
| `pnpm format` | Format all files |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | E2E tests |
| `pnpm migrate up` / `down` | Run or undo migrations |
