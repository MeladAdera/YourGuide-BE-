# Week 5 — Sessions and progress

Weeks 3 and 4 built the plan: a goal, cut into tasks, cut into steps. This week records the work. A focus session is started on a step, ended with a short review, and counted on the progress page. Every route here follows the same two rules as before: the `userId` comes from the session cookie and every query filters by it, and an archived goal is read-only.

Two different things are called "session" in this project. The login session is the cookie that says who you are (`auth_sessions`, week 2). A focus session is a stretch of work on one step (`sessions`). This page is about the second.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Start a session](#step-1--start-a-session) | YOU-22 | Done |

All commands on this page run inside `backend/`.

---

## Step 1 — Start a session

### Why

Everything built so far is a plan. Nothing in the database says that anyone sat down and worked. A focus session is that record: on which step, from when.

Why the app needs it:

- **It is the proof of effort.** A step marked done says the step got finished. It does not say how many sittings that took, and it says nothing about the evening you worked and did not finish. One step can take three sessions: stuck, progress, done. The app promises "proof I'm moving", so the first two must count too.
- **The server holds the start time.** The row stores `started_at`. The timer on the screen is only the browser counting from that time. A reload, a closed tab or another device cannot lose it.
- **It ties the work to one small step.** You cannot "just focus"; you focus on a step. The step leads to its task, its goal and the goal's why, which is what the AI advice (week 6) needs to fit the moment.

What is built on it:

- **Ending a session with its review** (the next step) needs a running session to end.
- **The progress page** (this week) counts focus minutes per day: end time minus start time.
- **"I'm struggling"** (week 6) links a struggle to the running session, so the app knows what you were working on. "Times I struggled and continued anyway" comes from that link.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/sessions/dto/start-session.dto.ts` | Boundary | `stepId`, a UUID. Nothing else can be sent |
| `src/sessions/dto/session.dto.ts` | Boundary | A running session, with its step, task and goal by name |
| `src/sessions/sessions.repository.ts` | Repository | `start` (one `INSERT`) and `findActive` (one `SELECT`) |
| `src/sessions/sessions.service.ts` | Service | Lock, four questions, write; the index's refusal becomes `409` |
| `src/sessions/sessions.controller.ts` | Controller | Two routes |
| `src/sessions/sessions.module.ts` | Module | Registered in `app.module.ts` |
| `src/sessions/session-constraints.ts` | Rule | `ONE_ACTIVE_SESSION`, the name of the unique index |
| `src/steps/steps.repository.ts` | Repository | `findLocked`: a step, held so it cannot be deleted |
| `src/steps/steps.module.ts` | Module | Exports the repository for the sessions module |
| `src/goals/goals.repository.ts` | Repository | `lock` and `hasRunningSession`, for archiving |
| `src/goals/goals.service.ts` | Service | `archive` is refused while a session runs under the goal |
| `src/goals/goals.controller.ts` | Controller | Swagger shows the new `409` on archive |
| `src/common/api-error.ts` | Rule | Four new codes |
| `test/sessions.e2e-spec.ts` | Test | 35 e2e tests |
| `test/goals.e2e-spec.ts` | Test | Its "work history" is now an ended session |
| `test/api-docs.e2e-spec.ts`, `test/api-docs-examples.e2e-spec.ts` | Test | Know the two new paths; the examples test fills `stepId` with a real id |

There is no migration. The `sessions` table and its unique index exist since week 1.

### How it works

**The routes**

| Request | Answer |
|---|---|
| `POST /api/sessions` `{ "stepId": "…" }` | `201`, the new session, running |
| `GET /api/sessions/active` | `200`, the running session, or `404` when nothing is running |

A session looks like this:

```
{ "id": "80b0…", "startedAt": "2026-10-06T18:18:59.816Z",
  "step": { "id": "466e…", "title": "Understand SELECT" },
  "task": { "id": "0441…", "title": "Learn PostgreSQL" },
  "goal": { "id": "f6de…", "title": "Ship my first product" } }
```

| Problem | Status | Code |
|---|---|---|
| No cookie, or the login is gone | `401` | `auth.not_logged_in` |
| A missing `stepId`, one that is not a UUID, an unknown field (`startedAt` is one) | `400` | `validation.failed` |
| No step with that id, **or it belongs to someone else** | `404` | `step.not_found` |
| The step's goal is archived | `409` | `goal.archived` |
| The step is already done | `409` | `session.step_done` |
| A session is already running | `409` | `session.already_active` |
| Nothing is running (`GET /sessions/active`) | `404` | `session.none_active` |
| Archiving a goal while a session runs under it | `409` | `goal.session_running` |

The path is `/sessions`, not `/steps/:id/sessions`. The session is the thing created, and the step is what it is about, so the step travels in the body. And because a user has one running session at most, "the running one" needs no id at all: `/sessions/active`.

**1. Four questions, in this order** (`src/sessions/sessions.service.ts`)

```ts
return await this.db.withTransaction(async (client) => {
  const goal = await this.goals.findLockedOfStep(client, userId, input.stepId);
  requireActive(goal, 'step.not_found');            // yours? 404.  active? 409.
  const step = await this.steps.findLocked(client, userId, input.stepId);
  if (step === undefined) throw new ApiError('step.not_found');
  if (step.doneAt !== null) throw new ApiError('session.step_done');
  await this.sessions.start(client, userId, input.stepId);
  return running(await this.sessions.findActive(client, userId));
});
```

Is the step yours (`404`)? Is its goal active (`409`)? Is the step still open (`409`)? Is nothing else running (`409`)?

"Yours?" comes first, as everywhere: someone else's step answers exactly like a step that does not exist, also when its goal is archived or the step is done. Starting a session is a write under a goal, so it begins like every other write under a goal: `findLockedOfStep` and `requireActive`, the same two lines the steps service uses.

**2. One running session: the index decides** (`session-constraints.ts`)

The fourth question is not asked in code at all. Week 1 created this index:

```sql
CREATE UNIQUE INDEX one_active_session_per_user
ON sessions(user_id) WHERE ended_at IS NULL;
```

It covers only running sessions. A user can have a thousand ended ones and one that runs. A second running one is refused by PostgreSQL with error `23505`, and the service turns that one named error into `409` with `session.already_active`.

*Why not look first and then insert?* "Is a session running?" followed by an `INSERT` has a gap between the two statements. A double click fits in it: both requests see "nothing is running", both insert, and the user has two timers. The index has no gap. The test `lets one of two starts at the same moment through` sends two starts at once: one is `201`, the other `409`. This is the same choice as the unique email in register and the foreign key that protects work history.

**3. The step is held while the session starts** (`StepsRepository.findLocked`)

```sql
SELECT … FROM steps WHERE id = $2 AND user_id = $1 FOR KEY SHARE
```

`FOR KEY SHARE` is the lightest row lock. It lets a rename or a tick through and makes a delete of this step wait.

*Is this real, or a worry?* It was tried against PostgreSQL 16 before the code was written. A step is deleted in one connection, not committed yet, and a session is started on it in another:

| How the session is inserted | What the second connection gets |
|---|---|
| Plain `INSERT … VALUES` | It waits, then fails: `violates foreign key constraint "sessions_step_id_fkey"`. For the user: `500` |
| Read the step `FOR KEY SHARE`, then insert | It waits, then finds no step. For the user: `404` |

The test `answers 404 when the step is deleted under it` replays this. With `FOR KEY SHARE` taken out, it fails with `expected 500 to be 404`.

The same read answers the third question: it returns `doneAt`.

**4. A step that is done cannot be started**

`409` with `session.step_done`. Done means done. If there is more to do on the step, it is not done: untick it, and the task shows `in_progress` while the timer runs, which is true.

The rule is about *starting*. Ticking a step while its session runs is allowed; that is the natural way to finish it.

**5. The answer names the step, the task and the goal** (`SessionsRepository.findActive`)

```sql
SELECT sessions.id, sessions.started_at,
       steps.id AS step_id, steps.title AS step_title,
       tasks.id AS task_id, tasks.title AS task_title,
       goals.id AS goal_id, goals.title AS goal_title
  FROM sessions
  JOIN steps ON steps.id = sessions.step_id
  JOIN tasks ON tasks.id = steps.task_id
  JOIN goals ON goals.id = tasks.goal_id
 WHERE sessions.user_id = $1 AND sessions.ended_at IS NULL
```

*Why not only `stepId`?* Think of the timer screen after a page reload. All the frontend has is the answer of `GET /sessions/active`. With only an id it could not show what you are working on: no route reads one step by its id. With the titles it can draw the whole screen from one call.

The titles are read when the answer is built, not copied into the session. Rename the step and the next read shows the new name.

`POST /sessions` builds its answer with this same statement, inside the same transaction. The two routes can never return different shapes.

There is no duration in the answer. The timer is "now minus `startedAt`", and the browser counts that itself. `startedAt` is the database's clock (the column's default, `now()`). A `startedAt` in the body is refused with `400`, for the same reason as a step's `doneAt`: the client says what happened, the server says when.

**6. Nothing running is `404`**

`GET /sessions/active` answers `404` with `session.none_active`, not `200` with `null`. An onboarding screen that is not saved yet answers the same way (`profile.screen_not_saved`), so the frontend already has one way to read "not there yet".

**7. A goal cannot be archived while a session runs under it** (`GoalsService.archive`)

An archived goal is read-only. A running session is a write still to come: ending it will save a review and can mark the step done. So the archive answers `409` with `goal.session_running` until the session is ended. "Archived means read-only" then holds with no exception.

```ts
archive(userId, goalId) {
  return this.db.withTransaction(async (client) => {
    if (!(await this.goals.lock(client, userId, goalId))) {
      throw new ApiError('goal.not_found');
    }
    if (await this.goals.hasRunningSession(client, userId, goalId)) {
      throw new ApiError('goal.session_running');
    }
    return found(this.goals.archive(client, userId, goalId));
  });
}
```

*Why lock the goal first?* A session being started holds the goal with `FOR SHARE` (question 2 above). `lock` asks for `FOR UPDATE`, which has to wait for that. When it gets the goal, the start has committed, and the next statement, `hasRunningSession`, sees the new session. The other way round, a start that comes during an archive waits, then reads an archived goal: `409` `goal.archived`.

*Is this real?* The test `waits for a session that is being started, then refuses` plays a start that has not committed and archives the goal at that moment. With the lock weakened to `FOR SHARE`, which does not wait for another `FOR SHARE`, the test fails with `expected 200 to be 409`: the goal is archived, and a session appears under it a moment later.

Archive was one statement. It is now three in a transaction. It is a rare action, and the price is small.

**8. What starting does not do**

- It does not change the step, and it does not move the task's status. Only a step marked done does (week 3: the status is read from the steps).
- It cannot be undone through the API yet. Ending a session is the next step. Until then a session is ended by hand, with SQL (see *Check it*).
- It makes the step work history at once. From the first second, the step, its task and its goal cannot be deleted (`409`), by the foreign key from week 3.

**9. The tests** (`test/sessions.e2e-spec.ts`)

| Rule (from the issue's *Done when*) | Test |
|---|---|
| Start, and active returns it | `starts a session on a step and answers with it, by name`, `returns the running session from /sessions/active` |
| Start again is `409` | `refuses a second start: 409, the first keeps running` |
| A step under an archived goal is `409` | `a step under an archived goal › refuses a session: 409, nothing saved` |
| Another user's step is `404` | `answers 404 for another user's step, exactly like no step at all` |

And the rest:

| Rule | Test |
|---|---|
| Nothing running is `404` | `answers 404 from /sessions/active when nothing is running` |
| The time is the server's | `takes the start time from the server's clock`; a `startedAt` in the body is `400` |
| A double click starts one session | `lets one of two starts at the same moment through` |
| After the session ends, a new one can start | `accepts a new start once the running session has ended` |
| One per user, not one in total | `counts per user: two users each run their own` |
| A done step is refused, and accepted once unticked | `a step that is done` (three tests) |
| A step can be ticked while its session runs | `lets a step be marked done while its session runs` |
| The step and the task status are left alone | `leaves the step and the status of its task alone` |
| A rename shows in the next read | `shows a rename the next time the session is read` |
| A started step is work history | `makes the step, its task and its goal impossible to delete` |
| Another user never sees my session | `does not show a running session to another user` |
| A delete or an archive at the same moment | `at the same moment as another request` (two tests) |
| Archive is refused while a session runs, for this goal only | `archiving a goal while a session runs under it` (five tests) |
| Bad bodies | six cases: no `stepId`, not a UUID, a number, `null`, a `startedAt`, a `userId` |
| `401` without a login | `needs a login on both endpoints` |
| The Swagger examples work | `accepts every request example exactly as Swagger pre-fills it` |

The two "same moment" tests and the archive race do not sleep and hope. They open a second connection, leave its transaction unfinished, send the request, and wait until PostgreSQL itself reports a connection waiting for a lock. Only then do they commit.

### Check it

```bash
pnpm test:e2e
```

All 351 tests pass. There is no migration to run.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running). In Apidog, import `http://localhost:3001/api/docs-json` again first, so the two new routes appear under **sessions**.

Ending a session comes in the next step. Until then, end one by hand in pgAdmin (<http://localhost:5050>):

```sql
UPDATE sessions SET ended_at = now() WHERE ended_at IS NULL;
```

1. **POST /auth/login**. **GET /goals** → copy a goal's `id`. **GET /goals/{goalId}/tasks** → copy a task's `id`. **GET /tasks/{taskId}/steps** → copy the ids of two steps that are not done. (Add some with **POST /tasks/{taskId}/steps** if needed.)
2. **GET /sessions/active** → `404` with `"code": "session.none_active"`. Nothing is running yet.
3. **POST /sessions** → *Execute* with the body exactly as pre-filled → `404` with `"code": "step.not_found"`. This is the one example that cannot work as it is: that id is nobody's step.
4. **POST /sessions** → replace the example id with your first step's id → `201`. The answer has `startedAt` and the titles of the step, its task and its goal.
5. **GET /sessions/active** → `200`, the same session.
6. **POST /sessions** with your second step's id → `409` with `"code": "session.already_active"`. One at a time.
7. **GET /goals/{goalId}/tasks** → the task's `status` is what it was. Starting work does not move it.
8. **PATCH /steps/{id}** on the first step with `{ "title": "Understand SELECT and WHERE" }`. **GET /sessions/active** → the step's new title.
9. **DELETE /steps/{id}** on the first step → `409` with `"code": "step.has_work_history"`.
10. **POST /goals/{id}/archive** → `409` with `"code": "goal.session_running"`.
11. In pgAdmin, run the `UPDATE` above. **GET /sessions/active** → `404` again.
12. **PATCH /steps/{id}** on the first step with `{ "done": true }`. **POST /sessions** with its id → `409` with `"code": "session.step_done"`. **PATCH** it with `{ "done": false }`, then **POST /sessions** again → `201`.
13. In pgAdmin, run the `UPDATE` again. **POST /goals/{id}/archive** → `200` this time. **POST /sessions** with the second step's id → `409` with `"code": "goal.archived"`. Then **POST /goals/{id}/unarchive**.
14. **POST /sessions** with `{ "stepId": "<your step id>", "startedAt": "2020-01-01T00:00:00.000Z" }` → `400`: `{ "field": "startedAt", "code": "whitelistValidation" }`. The time is the server's.
15. In pgAdmin:

    ```sql
    SELECT step_id, started_at, ended_at FROM sessions ORDER BY started_at;
    ```

    The sessions from steps 4 and 12, both ended. Nothing the refused calls tried was saved.
