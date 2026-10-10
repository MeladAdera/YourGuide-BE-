# Week 5 — Sessions and progress

Weeks 3 and 4 built the plan: a goal, cut into tasks, cut into steps. This week records the work. A focus session is started on a step, ended with a short review, and counted on the progress page. Every route here follows the same two rules as before: the `userId` comes from the session cookie and every query filters by it, and an archived goal is read-only.

Two different things are called "session" in this project. The login session is the cookie that says who you are (`auth_sessions`, week 2). A focus session is a stretch of work on one step (`sessions`). This page is about the second.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Start a session](#step-1--start-a-session) | YOU-22 | Done |
| 2 | [End a session with its review](#step-2--end-a-session-with-its-review) | YOU-23 | Done |
| 3 | [Stop the clock, review later](#step-3--stop-the-clock-review-later) | YOU-23 | Done |
| 4 | [Progress per day](#step-4--progress-per-day) | YOU-24 | Done |

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
- It does not end by itself. A session runs until it is ended with its review, which is step 2 on this page.
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
| `401` without a login | `needs a login on every endpoint` |
| The Swagger examples work | `accepts every request example exactly as Swagger pre-fills it` |

The two "same moment" tests and the archive race do not sleep and hope. They open a second connection, leave its transaction unfinished, send the request, and wait until PostgreSQL itself reports a connection waiting for a lock. Only then do they commit.

### Check it

```bash
pnpm test:e2e
```

All 351 tests pass. There is no migration to run.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running). In Apidog, import `http://localhost:3001/api/docs-json` again first, so the two new routes appear under **sessions**.

Some of these checks need a session to be over. Ending one is step 2 on this page: **POST /sessions/{id}/end**, with the session's `id` from the answer of **POST /sessions**. In this list, send it `{ "outcome": "progress", "rating": 3 }`, which leaves the step not done.

1. **POST /auth/login**. **GET /goals** → copy a goal's `id`. **GET /goals/{goalId}/tasks** → copy a task's `id`. **GET /tasks/{taskId}/steps** → copy the ids of two steps that are not done. (Add some with **POST /tasks/{taskId}/steps** if needed.)
2. **GET /sessions/active** → `404` with `"code": "session.none_active"`. Nothing is running yet.
3. **POST /sessions** → *Execute* with the body exactly as pre-filled → `404` with `"code": "step.not_found"`. This is the one example that cannot work as it is: that id is nobody's step.
4. **POST /sessions** → replace the example id with your first step's id → `201`. The answer has `startedAt` and the titles of the step, its task and its goal. Copy the session's `id`.
5. **GET /sessions/active** → `200`, the same session.
6. **POST /sessions** with your second step's id → `409` with `"code": "session.already_active"`. One at a time.
7. **GET /goals/{goalId}/tasks** → the task's `status` is what it was. Starting work does not move it.
8. **PATCH /steps/{id}** on the first step with `{ "title": "Understand SELECT and WHERE" }`. **GET /sessions/active** → the step's new title.
9. **DELETE /steps/{id}** on the first step → `409` with `"code": "step.has_work_history"`.
10. **POST /goals/{id}/archive** → `409` with `"code": "goal.session_running"`.
11. **POST /sessions/{id}/end** with the session's id and `{ "outcome": "progress", "rating": 3 }` → `200`. **GET /sessions/active** → `404` again.
12. **PATCH /steps/{id}** on the first step with `{ "done": true }`. **POST /sessions** with its id → `409` with `"code": "session.step_done"`. **PATCH** it with `{ "done": false }`, then **POST /sessions** again → `201`. Copy this session's `id`.
13. End this session the same way. **POST /goals/{id}/archive** → `200` this time. **POST /sessions** with the second step's id → `409` with `"code": "goal.archived"`. Then **POST /goals/{id}/unarchive**.
14. **POST /sessions** with `{ "stepId": "<your step id>", "startedAt": "2020-01-01T00:00:00.000Z" }` → `400`: `{ "field": "startedAt", "code": "whitelistValidation" }`. The time is the server's.
15. In pgAdmin (<http://localhost:5050>):

    ```sql
    SELECT step_id, started_at, ended_at FROM sessions ORDER BY started_at;
    ```

    The sessions from steps 4 and 12, both ended. Nothing the refused calls tried was saved.

---

## Step 2 — End a session with its review

### Why

A running session is only a start time. It becomes worth something when it ends.

- **Minutes need an end.** Focus minutes are end time minus start time. Until a session can end, the progress page has nothing to add up. A running session also blocks the next one, and it blocks archiving its goal.
- **The review is the honest part.** Three things: how it went (`done`, `progress`, `stuck`, `distracted`, `tired`), how it felt (1 to 5), and a short note if you want one. "Stuck" and "tired" are not failures to hide. They are answers the app needs: a step that reads stuck, stuck, progress, done shows that staying with it worked, and that is the proof this app exists to give.
- **`done` finishes the step.** One tap, not two, and the session and the step cannot disagree about whether the work got finished.

It is built now because:

- **The progress page (the next step) reads ended sessions**: minutes per day from the two times, steps finished per day from `done_at`.
- **The AI advice (week 6) reads the last sessions** and their outcomes, to know how the week has gone before it says anything.
- **The review screen (week 10) sends exactly this body.**

### What we built

| File | Layer | Purpose |
|---|---|---|
| `migrations/0010_review-only-on-ended-session.sql` | Database | A review can only be on a session that has ended |
| `src/sessions/dto/end-session.dto.ts` | Boundary | `outcome`, `rating`, and an optional `note` |
| `src/sessions/dto/session.dto.ts` | Boundary | `EndedSession`: the session, its end and its review |
| `src/sessions/sessions.repository.ts` | Repository | `end`: one `UPDATE` that ends, reviews and returns the answer |
| `src/sessions/sessions.service.ts` | Service | `end`: the update, then the step when the outcome is `done`, in one transaction |
| `src/sessions/sessions.controller.ts` | Controller | `POST /api/sessions/:id/end` |
| `src/common/api-error.ts` | Rule | `session.not_found` |
| `test/sessions.e2e-spec.ts` | Test | 27 new tests, 62 in the file |
| `test/schema.e2e-spec.ts` | Test | The new constraint; the rating and outcome tests now end the session they review |
| `test/api-docs.e2e-spec.ts`, `test/api-docs-examples.e2e-spec.ts` | Test | Know the new path; the examples test ends the session its own example started |

### How it works

**The route**

```
POST /api/sessions/:id/end
{ "outcome": "done", "rating": 4, "note": "Wrote three SELECT queries on the orders table." }
```

answers `200` with the session, ended:

```
{ "id": "613e…", "startedAt": "2026-10-06T18:54:00.439Z",
  "endedAt": "2026-10-06T18:54:00.523Z",
  "outcome": "done", "rating": 4,
  "note": "Wrote three SELECT queries on the orders table.",
  "step": { "id": "bc35…", "title": "Understand SELECT" },
  "task": { "id": "7134…", "title": "Learn PostgreSQL" },
  "goal": { "id": "cf2f…", "title": "Ship my first product" } }
```

| Field | Rule |
|---|---|
| `outcome` | Required. One of `done`, `progress`, `stuck`, `distracted`, `tired` |
| `rating` | Required. A whole number from 1 to 5 |
| `note` | Optional. Up to 1000 characters. Left out or `null`: no note |

| Problem | Status | Code |
|---|---|---|
| No cookie, or the login is gone | `401` | `auth.not_logged_in` |
| A missing or unknown `outcome`, a `rating` that is not a whole number from 1 to 5, an empty or too long `note`, an unknown field (`endedAt` is one) | `400` | `validation.failed` |
| An id in the path that is not a UUID | `400` | `bad_request` |
| No running session with that id: there is none, **it belongs to someone else**, or it has already ended | `404` | `session.not_found` |

**1. One statement asks and acts** (`SessionsRepository.end`)

```sql
UPDATE sessions
   SET ended_at = now(), outcome = $3, rating = $4, note = $5
  FROM steps
  JOIN tasks ON tasks.id = steps.task_id
  JOIN goals ON goals.id = tasks.goal_id
 WHERE sessions.id = $2 AND sessions.user_id = $1
   AND sessions.ended_at IS NULL
   AND steps.id = sessions.step_id
RETURNING sessions.id, sessions.started_at, sessions.ended_at, …
```

"Is this session yours, and is it still running?" is the `WHERE` of the statement that ends it. If no row comes back, there was nothing to end, and the answer is `404`.

*Why is "already ended" a `404`, and not its own error?* Telling it apart from "not yours" and "not there" would take a second read. That read is exactly the gap this statement does not have. And someone else's session must look like no session at all, as everywhere.

*Why not look first, then update?* A double click on "End". Both requests would see a running session, and the second review would overwrite the first. Here the second request waits for the first, looks again, and finds `ended_at` filled in: no row. The test `lets one of two ends at the same moment through` sends two at once and gets `200` and `404`.

So a review is written once. A second end changes nothing, and there is no route to edit a review.

The `FROM` joins the step, the task and the goal in, so the same statement that ends the session returns the whole answer.

(Step 3 changes the `WHERE` to `outcome IS NULL` and the `SET` to `ended_at = COALESCE(ended_at, now())`: a session whose clock was stopped earlier can still be reviewed, and keeps its time.)

**2. `done` finishes the step, in the same transaction** (`SessionsService.end`)

```ts
return this.db.withTransaction(async (client) => {
  const ended = await this.sessions.end(client, userId, sessionId, input);
  if (ended === undefined) throw new ApiError('session.not_found');
  if (input.outcome === 'done') {
    await this.steps.update(client, userId, ended.step.id, { done: true });
  }
  return ended;
});
```

| Outcome | The session | The step |
|---|---|---|
| `done` | ended | marked done, at the same instant |
| `progress`, `stuck`, `distracted`, `tired` | ended | left as it is |

Either the session ends and the step is done, or neither happens. That is what the transaction is for: there is no moment where the session says "done" and the step does not.

The step is marked with the same statement `PATCH /steps/:id` uses. So the rule from week 4 holds here too: a step that was already ticked while the session ran keeps its first time.

The task is never mentioned. Its status is read from its steps, so ending the session on a task's last open step makes the task `done`, with no code written for it.

**3. Why the id is in the path**

A user has one running session at most, so `POST /sessions/active/end` would have been enough to find it. But think of a tab left open since yesterday, still showing yesterday's timer. Pressing "End" there would end *today's* session. With the id in the path, a tab can only end the session it was showing, and for yesterday's that is a `404`.

**4. The time is the server's, again**

`ended_at` is `now()` in the database, as `started_at` was. An `endedAt` in the body is refused with `400`. Focus minutes are the difference of the two, so neither can come from the client.

**5. No goal lock this time**

Marking a step done is a write under a goal, and every such write so far locks the goal first, to be sure it is not archived. Ending a session does not need to. Step 1 decided that a goal cannot be archived while a session runs under it, and this session runs until this transaction commits. "Archived means read-only" holds with no extra lock and no exception.

**6. The database rule** (`migrations/0010_review-only-on-ended-session.sql`)

```sql
ALTER TABLE sessions
  ADD CONSTRAINT sessions_review_only_when_ended
    CHECK (
      ended_at IS NOT NULL
      OR (outcome IS NULL AND note IS NULL AND rating IS NULL)
    );
```

A review is what you say about a session once it is over. A row that is still running and already has an outcome is a contradiction. The API cannot write one, because the end and the review are one `UPDATE`. The constraint says the same in the database, where it also holds for a row changed by hand.

*Why only this direction?* "An ended session always has a review" is true of every session the API ends, but it is not a constraint. It would forbid closing a session without a review, and two cases may one day want exactly that: a session left running overnight, and one started by mistake. Both are open questions (`PROJECT.md` §12).

**7. What is not built**

- **Changing a review.** It is a record of how the session felt when it ended.
- **Discarding a session** that was started by mistake. Today it can only be ended, with a review.
- **Anything about a forgotten session.** One left running overnight counts all its hours when it is finally ended. This matters for the progress page and is decided there.

**8. The tests** (`test/sessions.e2e-spec.ts`, under `ending a session`)

The tests from step 1 that needed a session to be over now end it through this route, not with SQL.

| Rule (from the issue's *Done when*) | Test |
|---|---|
| End with `done` marks the step done | `marks the step done, at the moment the session ended` |
| If it was the last step, the task is `done` | `moves the task to in_progress, and to done with its last step` |
| Ending an already-ended session is `404` | `answers 404 for a session that has already ended, and keeps its review` |
| Ending without outcome or rating is `400` | `refuses to end with a missing outcome…`, `…a missing rating…` |

And the rest:

| Rule | Test |
|---|---|
| The answer is the session plus its end and review | `ends it with its review and answers with it` |
| An ended session is not the running one; the next can start | `is no longer the running session, and the next one can start` |
| The other four outcomes leave the step alone | `leaves the step not done with outcome …` (four tests) |
| A step ticked during the session keeps its time | `keeps the time of a step ticked while the session ran` |
| No note is `null` | `saves no note as null, left out or sent as null` |
| A double click ends once | `lets one of two ends at the same moment through` |
| Someone else's session looks like no session | `answers 404 for another user's session, exactly like no session at all` |
| An ended session is still work history | `leaves the step impossible to delete` |
| Bad bodies | twelve cases; each names its field, and the session is still running afterwards |
| `400` malformed id, `401` no login | one test each |
| The constraint itself | `rejects a review on a session that is still running` (schema) |
| The Swagger examples work as they are | `accepts every request example exactly as Swagger pre-fills it` |

### Check it

```bash
pnpm migrate up
pnpm test:e2e
```

`0010_review-only-on-ended-session` is applied, and all 379 tests pass.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running). In Apidog, import `http://localhost:3001/api/docs-json` again first, so the new route appears under **sessions**.

You need a task with two steps that are not done. **GET /tasks/{taskId}/steps** shows them; add some with **POST /tasks/{taskId}/steps** if needed.

1. **POST /sessions** with the first step's id → `201`. Copy the session's `id`.
2. **POST /sessions/{id}/end** → paste the session id, change `rating` to `9` → `400`: `{ "field": "rating", "code": "max" }`. **GET /sessions/active** → `200`: a refused review ends nothing.
3. **POST /sessions/{id}/end** with `"endedAt": "2020-01-01T00:00:00.000Z"` added to the body → `400`: `{ "field": "endedAt", "code": "whitelistValidation" }`. The time is the server's.
4. **POST /sessions/{id}/end** → *Execute* with the body exactly as pre-filled (`done`, `4`, a note) → `200`. The answer has `endedAt` and the review.
5. **GET /tasks/{taskId}/steps** → the first step's `doneAt` is the session's `endedAt`, to the millisecond. **GET /goals/{goalId}/tasks** → the task is `"in_progress"`. Nobody ticked the step.
6. **GET /sessions/active** → `404` with `"code": "session.none_active"`.
7. *Execute* the same **POST /sessions/{id}/end** again → `404` with `"code": "session.not_found"`. A double click ends once.
8. **POST /sessions** with the first step's id again → `409` with `"code": "session.step_done"`.
9. **POST /sessions** with the second step's id → `201`. End it with `{ "outcome": "stuck", "rating": 2 }` → `200`, with `"note": null`. **GET /tasks/{taskId}/steps** → the second step is still not done.
10. **POST /sessions** with the second step's id once more, and end it as pre-filled (`done`). **GET /goals/{goalId}/tasks** → the task is `"done"`, if those were its only two open steps.
11. In pgAdmin (<http://localhost:5050>):

    ```sql
    SELECT started_at, ended_at, outcome, rating, note FROM sessions ORDER BY started_at;
    ```

    Three rows: `done`, `stuck`, `done`. The step that took two sessions shows it.
12. The database rule. **PATCH /steps/{id}** one step back to `{ "done": false }` and **POST /sessions** on it. Then in pgAdmin:

    ```sql
    UPDATE sessions SET outcome = 'done' WHERE ended_at IS NULL;
    ```

    → `ERROR: … violates check constraint "sessions_review_only_when_ended"`. Then end the session through the API.
13. **POST /goals/{id}/archive** → `200`, now that nothing is running. **DELETE /goals/{id}** → `409` with `"code": "goal.has_work_history"`: the sessions are proof of work, and they stay. Then **POST /goals/{id}/unarchive**.

---

## Step 3 — Stop the clock, review later

### Why

On 2026-10-10 four rules were added to `PROJECT.md` §6.3:

1. **Nothing closes a session automatically.** Leave the app, and the clock keeps running until you come back.
2. **The review may be postponed**, but the session stays open until it is written. No new session starts while one is open or awaiting its review.
3. **No ending without a review.** Outcome and rating are required; the note is optional.
4. **No cancelling.** A session started by mistake is ended like any other, with its review.

Rules 1, 3 and 4 were already true of steps 1 and 2: the backend never closes a session, `POST /sessions/:id/end` is the only way to end one and it requires the review, and there is no cancel or delete route. Rule 2 needed a decision: when the review is postponed, does the clock keep running?

**It stops.** Focus minutes are `ended_at − started_at`, and they are the progress page's first number. Someone who stops working at six and writes the review at ten should not have four extra hours. So a session gets a third state, between running and completed: *awaiting review*. The clock has stopped, the review is still owed, and until it is written the session is still the open one.

| State | `ended_at` | `outcome`, `rating` | Blocks a new start and the goal's archive |
|---|---|---|---|
| running: the clock counts | empty | empty | yes |
| awaiting review: "Later" was pressed | set | empty | yes |
| completed: reviewed | set | set | no |

### What we built

| File | Layer | Purpose |
|---|---|---|
| `migrations/0011_session-awaiting-review.sql` | Database | "One active session" now means one *unreviewed* session; a review is whole |
| `src/sessions/dto/session.dto.ts` | Boundary | `endedAt` on the active session: null while the clock runs |
| `src/sessions/sessions.repository.ts` | Repository | `stop`; `end` accepts a stopped session; `markStepDone` at the session's end time |
| `src/sessions/sessions.service.ts` | Service | `stop`; `end` marks the step as of the end time |
| `src/sessions/sessions.controller.ts` | Controller | `POST /api/sessions/:id/stop` |
| `src/goals/goals.repository.ts`, `goals.service.ts` | Repository, Service | The archive waits for the review, not only for the clock |
| `src/common/api-error.ts` | Rule | `session.not_running`; four sentences reworded, codes unchanged |
| `test/sessions.e2e-spec.ts` | Test | 8 new tests, 70 in the file |
| `test/schema.e2e-spec.ts` | Test | The new index predicate and the new check |
| `test/goals.e2e-spec.ts` | Test | Its "work history" is now a completed session |
| `test/api-docs.e2e-spec.ts` | Test | Knows the new path |

### How it works

**The route**

| Request | Answer |
|---|---|
| `POST /api/sessions/:id/stop` | `200`, the session with `endedAt` set, awaiting its review |

And two routes from steps 1 and 2 change their meaning a little:

| Request | Now |
|---|---|
| `GET /api/sessions/active` | The open session, running (`endedAt` null) or awaiting review (`endedAt` set). That one field tells the frontend which screen to draw after a reload: the timer, or the review form |
| `POST /api/sessions/:id/end` | Completes a running session *or* a stopped one. A stopped one keeps the time its clock stopped |

| Problem | Status | Code |
|---|---|---|
| Stopping a session that is not running: there is none, it belongs to someone else, or its clock has already stopped | `404` | `session.not_running` |
| Ending a session that is not open: none, someone else's, or already reviewed | `404` | `session.not_found` |
| Starting while a session is open, running or awaiting review | `409` | `session.already_active` |
| Archiving the goal while a session under it is open | `409` | `goal.session_running` |

The codes are the ones from steps 1 and 2; a code is never renamed. Their sentences now say "open" and "not finished" instead of "running".

**1. "Active" now means "not yet reviewed"** (`migrations/0011_session-awaiting-review.sql`)

```sql
DROP INDEX one_active_session_per_user;
CREATE UNIQUE INDEX one_active_session_per_user
  ON sessions(user_id)
  WHERE outcome IS NULL;
```

Week 1's index covered `ended_at IS NULL`. With that predicate, stopping the clock would have let a new session start with the review still owed, against rule 2. Now the index covers every session without an outcome: running, or stopped and waiting. The name is the same, so the code that catches the refusal (`ONE_ACTIVE_SESSION`, step 1) did not change.

Tried against PostgreSQL 16 before writing the migration: a stopped session makes a second insert fail on the index, a reviewed one lets it through.

**2. Stop: one statement, like end** (`SessionsRepository.stop`)

```sql
UPDATE sessions SET ended_at = now()
 WHERE sessions.id = $2 AND sessions.user_id = $1 AND sessions.ended_at IS NULL
```

No row: nothing was running under that id for you, `404`. A double click on "Later" is caught the same way as a double click on "End" in step 2: the question is inside the statement, and the second request finds nothing to stop.

**3. End accepts a stopped session and keeps its time** (`SessionsRepository.end`)

```sql
SET ended_at = COALESCE(sessions.ended_at, now()), outcome = $3, rating = $4, note = $5
WHERE … AND sessions.outcome IS NULL
```

Two small changes to step 2's statement. `COALESCE`: a running session ends now, a stopped one keeps the time its clock stopped. `outcome IS NULL` instead of `ended_at IS NULL`: a stopped session is still there to be reviewed; a reviewed one is not. The frontend has one review form and one call, however the session got there.

*Why not a separate `/review` route for stopped sessions?* The review screen would have had two ways to send the same body, and a reason to pick the wrong one.

**4. The step is done when the clock stopped** (`SessionsRepository.markStepDone`)

```sql
UPDATE steps SET done_at = COALESCE(steps.done_at, sessions.ended_at)
  FROM sessions
 WHERE sessions.id = $2 AND sessions.user_id = $1
   AND steps.id = sessions.step_id AND steps.user_id = $1
```

Step 2 marked the step with `now()`. With a postponed review that would be the time of the form, perhaps the next morning, and the step would land on the wrong day of the progress page. The time is read from the session row itself, so the two are the same instant to the microsecond. `COALESCE` keeps an earlier time, as everywhere: a step ticked while the session ran stays on that time.

**5. A review is whole** (`migrations/0011`)

```sql
ALTER TABLE sessions ADD CONSTRAINT sessions_review_complete
  CHECK ((outcome IS NULL) = (rating IS NULL));
```

With three states, a row must be in exactly one of them. A session with an outcome and no rating would be neither awaiting review nor completed. The API never writes one, because the review is one `UPDATE`; the constraint says the same in the database, where it also holds for a row changed by hand. Step 2's check (a review only on an ended session) stays, and "an ended session always has a review" is still not a constraint: a stopped session is ended and unreviewed, by design now.

**6. The archive waits for the review** (`GoalsRepository.hasActiveSession`)

Step 1 refused the archive while a session was *running* under the goal. Now it is refused while one is *unreviewed* there, because the review is still to come and can mark the step done, which is a write under the goal. The lock and the order of the statements are as in step 1; only the predicate changed to `outcome IS NULL`.

**7. The tests** (`test/sessions.e2e-spec.ts`, under `stopping the clock, review later`)

| Rule | Test |
|---|---|
| Stop sets `endedAt`, writes no review, and the session stays the active one | `stops the clock and keeps the session open, awaiting its review` |
| A stopped session blocks a new start and the archive | `still blocks a new start and the archive of its goal` |
| The review keeps the stop time; afterwards a new session can start | `is completed by the review, keeping the time the clock stopped` |
| The step is done at the stop time, not the review time | `marks the step done at the time the clock stopped, not at the review` |
| Stop twice, or after the review | `answers 404 once the clock has stopped, and after the review` |
| A double click on "Later" | `lets one of two stops at the same moment through` |
| Someone else's session looks like no session | `answers 404 for another user's session, exactly like no session at all` |
| `400` malformed id, `401` no login | one test, and `needs a login on every endpoint` |
| The index and the check themselves | `rejects a new session while the previous one is stopped but not reviewed`, `rejects a review with only an outcome, or only a rating` (schema) |

### Check it

```bash
pnpm migrate up
pnpm test:e2e
```

`0011_session-awaiting-review` is applied, and all 389 tests pass.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running). In Apidog, import `http://localhost:3001/api/docs-json` again first, so the new route appears under **sessions**.

You need a task with two steps that are not done.

1. **POST /sessions** with the first step's id → `201`, with `"endedAt": null`: the clock runs. Copy the session's `id`.
2. **POST /sessions/{id}/stop** → `200`, the same session with `endedAt` set. This is "Later" on the review screen.
3. **GET /sessions/active** → `200`, still this session, `endedAt` set. After a reload the frontend knows to show the review form, not the timer.
4. **POST /sessions** with the second step's id → `409` with `"code": "session.already_active"`. The review is still owed.
5. **POST /goals/{id}/archive** → `409` with `"code": "goal.session_running"`.
6. **POST /sessions/{id}/stop** again → `404` with `"code": "session.not_running"`. The clock is already stopped.
7. Wait a few seconds. **POST /sessions/{id}/end** → *Execute* as pre-filled (`done`) → `200`. Its `endedAt` is the time from step 2, not now.
8. **GET /tasks/{taskId}/steps** → the first step's `doneAt` is that same time. The step was finished when the clock stopped, not when you wrote the review.
9. **GET /sessions/active** → `404`. **POST /sessions/{id}/stop** and **POST /sessions/{id}/end** on this session → `404` each, `session.not_running` and `session.not_found`.
10. **POST /sessions** with the second step's id, then **POST /sessions/{id}/end** straight away with `{ "outcome": "progress", "rating": 3 }` → `200`. No stop is needed when you review at once.
11. **POST /goals/{id}/archive** → `200`, nothing is open. Then **POST /goals/{id}/unarchive**.
12. In pgAdmin (<http://localhost:5050>):

    ```sql
    SELECT started_at, ended_at, outcome, rating FROM sessions ORDER BY started_at;
    ```

    Two rows. The first ended at the time of step 2, although it was reviewed later. Then:

    ```sql
    UPDATE sessions SET rating = NULL WHERE outcome IS NOT NULL;
    ```

    → `ERROR: … violates check constraint "sessions_review_complete"`. A review is whole, or it is not there yet.

---

## Step 4 — Progress per day

### Why

This is the number the app exists to show. Everything since week 3 was built so that one answer can say "you are moving": the sessions for the minutes, `done_at` on the steps for the steps finished, the struggles for the times you were about to stop and did not. `PROJECT.md` §6.7 calls the last one the most important number in the app.

Three reasons it is built now:

- **It closes the week.** Sessions start and end; this is what they add up to.
- **It is what `users.timezone` is for.** Progress is per day, and the day must be the user's day. A session at 01:30 in Dubai is 21:30 the day before in UTC, and on a chart grouped by UTC it would sit on the wrong bar. The timezone was asked for at registration (week 2) for exactly this query.
- **The AI advice (week 6) reads it.** "My recent progress, last 7 days" goes into every prompt. That is this same call.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/progress/dto/progress.query.ts` | Boundary | `days`: 1 to 90, default 7 |
| `src/progress/dto/progress.dto.ts` | Boundary | The answer: days and totals |
| `src/progress/progress.repository.ts` | Repository | One statement |
| `src/progress/progress.service.ts` | Service | The totals, added up from the days |
| `src/progress/progress.controller.ts` | Controller | `GET /api/progress` |
| `src/progress/progress.module.ts` | Module | Registered in `app.module.ts`; imports nothing |
| `test/progress.e2e-spec.ts` | Test | 22 e2e tests |
| `test/api-docs.e2e-spec.ts` | Test | Knows the new path |

No migration, and no new table: progress is read from what is already there.

### How it works

**The route**

```
GET /api/progress?days=7
```

answers `200`:

```
{ "days": [
    { "date": "2026-10-04", "focusMinutes": 50, "stepsDone": 2, "struggledAndContinued": 1 },
    …
    { "date": "2026-10-10", "focusMinutes": 0, "stepsDone": 0, "struggledAndContinued": 0 } ],
  "totals": { "focusMinutes": 310, "stepsDone": 9, "struggledAndContinued": 4 } }
```

| Field | Meaning |
|---|---|
| `date` | A day in your timezone, `YYYY-MM-DD`. Oldest first, today last, every day present |
| `focusMinutes` | Minutes of the sessions that started on this day and have ended, rounded |
| `stepsDone` | Steps marked done on this day |
| `struggledAndContinued` | Times you said "I'm struggling" on this day and then continued |
| `totals` | The same three, added up over the days |

| Problem | Status | Code |
|---|---|---|
| No cookie, or the login is gone | `401` | `auth.not_logged_in` |
| `days` is not a whole number from 1 to 90, or an unknown query field | `400` | `validation.failed` |

**1. One statement** (`ProgressRepository.lastDays`)

Five parts, each a named piece (`WITH … AS`) of one query:

| Part | What it is |
|---|---|
| `me` | Your timezone, and the first day of the window: today in that timezone, minus `days − 1` |
| `since` | The first instant of that day, as an instant: `first_day::timestamp AT TIME ZONE timezone` |
| `day` | One row per day from the first day to today, from `generate_series` |
| `focus`, `done`, `continued` | Each table's rows since `since`, grouped by their local date |

Then `day` is joined to the three counts with `LEFT JOIN`, so a day with nothing keeps its row and `COALESCE` turns the missing count into 0.

**2. The user's day** 

```sql
(started_at AT TIME ZONE me.timezone)::date
```

`AT TIME ZONE` turns an instant into the wall-clock time of that zone; `::date` keeps the date. The same is done for `done_at` and for a struggle's `created_at`. Tried against PostgreSQL before writing it: `2026-10-05 21:30+00` is `2026-10-06` in `Asia/Dubai`. The test `puts the same instant on different days for users in different timezones` registers a second user in UTC, gives both the same session, and gets different days.

**3. Minutes**

A session counts on the day it started, all of it, even past midnight. Its minutes are `ended_at − started_at`, so:

| Session | Counts |
|---|---|
| Completed | yes |
| Stopped, awaiting its review | yes: its clock has stopped |
| Running | nothing yet |
| Under an archived goal | yes: archiving puts a goal away, it does not erase the work |

The seconds of a day are added up first and rounded once. Three sessions of 10:20 would each lose 20 seconds if rounded one by one; together they make 31 minutes, which is what happened.

**4. Zeros where nothing happened**

`generate_series(first_day, today, interval '1 day')` makes one row per day whether or not anything is in the tables. A chart needs an even axis, and "nothing on Tuesday" is something the page should be able to show.

**5. Only the window is read**

Every count has `… >= since.at`, the first instant of the first day. The `(user_id, started_at)` index from week 1 then finds the rows directly, so the query costs the same after years of sessions as on the first day.

**6. `days`, and why the date is text**

Query values are always text, so `days` is checked as text: one or two digits, 1 to 90 (`matches`). Left out means 7. And the date comes back as `to_char(day, 'YYYY-MM-DD')`, not as a `date` column: the `pg` driver would turn a `date` into a JavaScript `Date` at the server's local midnight, and the day could shift on the way to the client.

**7. The totals are the days added up** (`ProgressService.lastDays`)

Not a second query. The days are the one source of truth, and a sum in code cannot disagree with them.

**8. The tests** (`test/progress.e2e-spec.ts`)

Sessions and struggles are written straight into the tables, so their times can be chosen (a struggle has no API until week 6). Steps are marked done through the API where the day is today, and by SQL for other days.

| Rule (from the issue's *Done when*) | Test |
|---|---|
| A session at 01:30 in Dubai counts on the Dubai day | `counts a session at 01:30 in Dubai on the Dubai day, not the UTC day` |
| A running session adds 0 | `adds nothing for a session that is still running` |
| Archiving changes nothing | `does not change when the goal is archived` |

And the rest:

| Rule | Test |
|---|---|
| Seven days of zeros, oldest first, today last | `answers seven days of zeros, oldest first, today last` |
| The same instant lands on different days for a UTC user | `puts the same instant on different days for users in different timezones` |
| A stopped session counts | `counts a stopped session that is awaiting its review` |
| A session across midnight is on its first day | `counts a session on the day it started, all of it, across midnight` |
| Rounding once per day | `adds the seconds of a day up before rounding to minutes` |
| Steps by the day they were marked, unticked forgotten | `counts steps on the day they were marked done, and forgets one unticked` |
| Only continued struggles count | `counts only the struggles you continued after` |
| Older rows are left out; the first day is in | `leaves out what is older than the days asked for` |
| `days` from 1 to 90; seven bad values; an unknown field | `answers as many days as asked, from 1 to 90`, `refuses days=…`, `refuses an unknown query field` |
| Another user's work is invisible | `does not count another user's work` |
| `401` without a login | `needs a login` |

### Check it

```bash
pnpm test:e2e
```

All 411 tests pass. There is no migration to run.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running). In Apidog, import `http://localhost:3001/api/docs-json` again first, so the new route appears under **progress**.

1. **GET /progress** → *Execute* with `days` as pre-filled (`7`) → `200`, seven days ending today, your timezone's today. Whatever you did in steps 1 to 3 is in there: the sessions you ended as minutes, the steps you ticked under `stepsDone`.
2. **GET /progress** with `days` = `1` → today only. With `90` → ninety days.
3. **GET /progress** with `days` = `0`, then `91`, then `abc` → `400` with `{ "field": "days", "code": "matches" }` each time.
4. **POST /sessions** on a step, wait a minute, **POST /sessions/{id}/end** with `{ "outcome": "done", "rating": 4 }`. **GET /progress** → today's `focusMinutes` grew by one and `stepsDone` by one.
5. **POST /sessions** on another step and leave it running for a minute or two. **GET /progress** → nothing changed: a running session adds nothing yet. Then **POST /sessions/{id}/stop** → **GET /progress** → its minutes are there, before any review. End it.
6. **POST /goals/{id}/archive** → **GET /progress** → the same numbers. **POST /goals/{id}/unarchive**.
7. In pgAdmin (<http://localhost:5050>), the day boundary. Your `started_at` values are stored in UTC; the answer groups them by your timezone:

   ```sql
   SELECT started_at, (started_at AT TIME ZONE 'Asia/Dubai')::date AS dubai_day FROM sessions ORDER BY started_at;
   ```

   A session started after 20:00 UTC shows the next day's date in `dubai_day`, and that is the day it is counted on.

