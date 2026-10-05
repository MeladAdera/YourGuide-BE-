# Week 4 — Steps

Week 3 ended with tasks: a goal cut into pieces of work. This week cuts a task into steps, the unit a person actually sits down to do, and lets them be put in order. Every route here follows the same two rules as week 3: the `userId` comes from the session cookie and every query filters by it, and an archived goal is read-only.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Steps](#step-1--steps) | YOU-20 | Done |
| 2 | Reorder steps | YOU-21 | Not started |

All commands on this page run inside `backend/`.

---

## Step 1 — Steps

### Why

"Learn PostgreSQL" is a task. It is still too big for one evening, and something too big is exactly what gets postponed. A step is small enough to finish in one sitting: "Understand SELECT". The app's whole promise is a small next thing to do at the moment someone wants to give up, and that thing is a step.

Four reasons it is built now:

- **A focus session starts on a step.** `sessions.step_id` is required. Week 5 cannot start without steps.
- **It makes the task status move.** Week 3 decided that a task's status is read from its steps. Until now only SQL could change a step. From here on, ticking steps in the app moves a task from `todo` to `in_progress` to `done`, with no code written for it.
- **It is the first write to `done_at`.** The progress page (week 5) counts steps finished per day from that column. Who writes it, and when, is decided here.
- **It decides what order means.** Steps are the first thing in the app with an order. How a new one is placed, and what happens to the order when one is deleted, has to be settled before reordering (the next step) is built on top of it.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/steps/dto/step.dto.ts` | Boundary | A step as the API returns it: no `position` |
| `src/steps/dto/create-step.dto.ts` | Boundary | The title |
| `src/steps/dto/update-step.dto.ts` | Boundary | `title` and `done`, both optional, neither `null` |
| `src/steps/steps.repository.ts` | Repository | Four statements, each filtered by `user_id` |
| `src/steps/steps.service.ts` | Service | Lock, "yours? active?", write; the foreign-key refusal becomes `409` |
| `src/steps/steps.controller.ts` | Controller | Four routes |
| `src/steps/steps.module.ts` | Module | Registered in `app.module.ts` |
| `src/goals/require-active.ts` | Rule | `requireActive`, moved out of the tasks service: tasks and steps ask in one place |
| `src/goals/goals.repository.ts` | Repository | `findLockedOfStep`: the goal a step is under |
| `src/tasks/tasks.repository.ts` | Repository | `find`, and `lock` for adding a step |
| `src/common/api-error.ts` | Rule | Two new codes |
| `test/steps.e2e-spec.ts` | Test | 41 e2e tests |
| `test/api-docs.e2e-spec.ts`, `test/api-docs-examples.e2e-spec.ts` | Test | Know the two new paths |

There is no migration. The `steps` table from week 1 already has everything this step needs.

### How it works

**The routes**

| Request | Answer |
|---|---|
| `GET /api/tasks/:taskId/steps` | `200`, the task's steps, in order |
| `POST /api/tasks/:taskId/steps` `{ "title": "…" }` | `201`, the new step, placed last, not done |
| `PATCH /api/steps/:id` `{ "title": "…", "done": true }` | `200`, the step; only what was sent changed |
| `DELETE /api/steps/:id` | `204`, or `409` when the step has a focus session |

The three that write answer `409` while the goal is archived. The list always works.

A step looks like this:

```
{ "id": "3f1c…", "taskId": "b48b…", "title": "Understand SELECT",
  "doneAt": null, "createdAt": "2026-10-05T09:33:20.784Z" }
```

| Problem | Status | Code |
|---|---|---|
| No cookie, or the session is gone | `401` | `auth.not_logged_in` |
| A missing or empty title, one over 200 characters, a `done` that is not `true` or `false`, an unknown field (`position` and `doneAt` are two) | `400` | `validation.failed` |
| An id in the path that is not a UUID | `400` | `bad_request` |
| No task with that id, **or it belongs to someone else** (list and create) | `404` | `task.not_found` |
| No step with that id, **or it belongs to someone else** (change and delete) | `404` | `step.not_found` |
| Adding, changing or deleting a step while its goal is archived | `409` | `goal.archived` |
| Deleting a step that has a focus session | `409` | `step.has_work_history` |

The paths have the same two shapes as tasks: created and listed under the parent (`/tasks/:taskId/steps`), changed by its own id (`/steps/:id`).

**1. Order: a position the client never sees** (`src/steps/steps.repository.ts`)

`steps.position` is a number, unique inside a task. A new step gets the highest one plus one:

```sql
INSERT INTO steps (user_id, task_id, title, position)
VALUES ($1, $2, $3,
        (SELECT COALESCE(max(position), 0) + 1 FROM steps
          WHERE task_id = $2 AND user_id = $1))
```

and the list is `ORDER BY position`.

The API does not return the number. Delete the second of three steps and the positions are 1 and 3. The order is still right, but a client that showed "step 3 of 2" would not be. So the answer is the steps *in order*, and the order of the list is the only order there is.

*Why not close the gap on delete?* Moving the later steps down is one `UPDATE` over several rows, and PostgreSQL checks a plain unique constraint row by row. Whether "3 becomes 2, 4 becomes 3" passes depends on which row it happens to update first. The next step (reorder) changes the constraint so that it is checked at the end of the transaction. Until then a gap is harmless, because nobody sees it.

**2. Two steps added at the same moment** (`src/steps/steps.service.ts`, `TasksRepository.lock`)

"Highest position plus one" is a read followed by a write. Two requests at the same moment would both read 3 and both write 4, and the unique constraint would refuse the second: a crash, for something the user did not do wrong.

So before the insert, the service takes a lock on the task row:

```sql
SELECT 1 FROM tasks WHERE id = $2 AND user_id = $1 FOR UPDATE
```

The second request waits at this line until the first has committed. Then it reads the new highest position.

*Is this real, or a worry?* The test `gives steps added at the same moment each their own place` sends five adds at once. With the lock taken out, three of them answer `500` with `duplicate key value violates unique constraint "steps_task_id_position_key"`. With it, all five are `201`.

*Why must the lock be its own statement?* A statement sees the database as it was when the statement began. If the lock and the "highest plus one" were one statement, it would wait for the other request and then still count with what it saw before waiting.

**3. Done and not done** (`src/steps/dto/update-step.dto.ts`, `StepsRepository.update`)

The client sends `done: true` or `done: false`. The server writes the time:

```sql
done_at = CASE
            WHEN $4::boolean IS NULL THEN done_at        -- not sent: unchanged
            WHEN $4::boolean THEN COALESCE(done_at, now()) -- done: keep the first time
            ELSE NULL                                     -- not done
          END
```

| Sent | `done_at` before | `done_at` after |
|---|---|---|
| nothing | anything | unchanged |
| `done: true` | empty | now |
| `done: true` | a time | the same time |
| `done: false` | anything | empty |

*Why can the client not send the time?* The progress page counts steps finished per day. A client that could send `doneAt` could put a step on any day. `doneAt` in a body is refused with `400`, like any unknown field.

*Why keep the first time?* So a second tick on a step that is already done, a double click or a retry after a lost connection, does not move yesterday's work to today.

*Why a field in `PATCH`, when archiving a goal has its own routes?* Archiving is an event with consequences for everything under the goal. Done is a checkbox, ticked many times a day, often together with a new title. What matters is the same in both: the client says what happened, the server says when.

**4. The task follows by itself**

Nothing in `StepsService` mentions the task's status. Marking a step done writes one column of one step. The next time the task is read, its status query (week 3, step 11) counts the steps again:

| What you do | The task becomes |
|---|---|
| Add steps, none done | still `todo` |
| Mark one of two done | `in_progress` |
| Mark the other done | `done` |
| Unmark one | `in_progress` |
| Add a step to a `done` task | `in_progress`: there is something left to do |
| Delete the last step that was not done | `done` |

This is the payoff of not storing the status. There are six ways above for a stored copy to fall out of step, and no code was written for any of them.

**5. An archived goal is read-only, all the way down** (`src/goals/require-active.ts`)

The rule from tasks covers steps: no adding, renaming, marking or deleting while the goal is archived. The three writes have the same shape as in `TasksService`:

```ts
update(userId, stepId, input) {
  return this.db.withTransaction(async (client) => {
    const goal = await this.goals.findLockedOfStep(client, userId, stepId);
    requireActive(goal, 'step.not_found');   // yours? 404.  active? 409.
    return found(await this.steps.update(client, userId, stepId, input));
  });
}
```

`findLockedOfStep` walks step → task → goal in one statement and locks the goal, so it cannot be archived between the question and the write. `requireActive` moved from the tasks service to `src/goals/`, next to the goal it asks about, because two modules now use it.

Create takes two locks, for two reasons: the goal's (shared) so it stays active, and the task's (exclusive) for the position. Always in that order, goal then task, which is also the order a task delete takes them. Two requests that lock the same things in the same order cannot block each other forever.

**6. Deleting**

The same as a goal and a task: no "does it have sessions?" check, the database refuses when the step has a focus session, and the service turns that one named constraint into `409` with `step.has_work_history`. A step that cannot be deleted can still be marked done or renamed.

**7. The tests** (`test/steps.e2e-spec.ts`)

Sessions have no API yet, so the delete test inserts one with SQL. Everything else goes through the API, including the task status.

| Rule (from the issue's *Done when*) | Test |
|---|---|
| The task goes `todo` → `in_progress` → `done` as steps are marked, and back | `moves the task todo → in_progress → done, and back` |
| User B gets `404` on every endpoint | `answers 404 on every endpoint for another user's task or step` |

And the rest:

| Rule | Test |
|---|---|
| Steps come in the order they were added, each task its own | `lists the steps of one task only, in the order they were added` |
| A new step goes last, also after a delete | `puts a new step last, also after a delete in the middle` |
| Simultaneous adds each get a place | `gives steps added at the same moment each their own place` |
| A change does not move a step | `keeps the place of a step that is renamed or marked done` |
| A new step reopens a finished task; deleting the open one finishes it | `makes a finished task in_progress again…`, `finishes the task when its last open step is deleted` |
| The server writes the time, and clears it | `writes the time when a step is marked done, and clears it again` |
| Done twice keeps the first time | `keeps the first time when a step is marked done twice` |
| `PATCH` changes only what is sent | three tests |
| An archived goal refuses all four changes, still lists, and recovers | `an archived goal is read-only` (seven tests) |
| Delete with a session is `409` | `refuses to delete a step with a session: 409, nothing deleted` |
| Bad bodies | seven cases on create, eight on change; `position`, `doneAt` and `done: null` among them |
| `404` unknown id, `400` malformed id, `401` no login | one test each, all four routes |
| The Swagger examples work as they are | `accepts every request example exactly as Swagger pre-fills it` |

### Check it

```bash
pnpm test:e2e
```

All 294 tests pass. There is no migration to run.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running). In Apidog, import `http://localhost:3001/api/docs-json` again first, so the four new routes appear under **steps**.

1. **POST /auth/login**. **GET /goals** → copy a goal's `id`. **GET /goals/{goalId}/tasks** → copy a task's `id`. (No task yet? **POST /goals/{goalId}/tasks** with the example.)
2. **POST /tasks/{taskId}/steps** → paste the task id → the example is `{ "title": "Understand SELECT" }` → *Execute* → `201`, with `"doneAt": null` and no `position`. Copy the step's `id`.
3. **POST /tasks/{taskId}/steps** twice more, with `{ "title": "Practice WHERE" }` and `{ "title": "Practice JOIN" }`.
4. **GET /tasks/{taskId}/steps** → the three steps, in the order you added them. **GET /goals/{goalId}/tasks** → the task is `"todo"`.
5. **PATCH /steps/{id}** with the first step's id → the example is `{ "title": "Understand SELECT and WHERE", "done": true }` → `200`, with a time in `doneAt`. **GET /goals/{goalId}/tasks** → the task is now `"in_progress"`.
6. **PATCH /steps/{id}** with `{ "done": true }` on the other two. **GET /goals/{goalId}/tasks** → `"done"`. Nobody set that.
7. **PATCH /steps/{id}** with `{ "done": false }` on one → its `doneAt` is `null` again, and the task is back to `"in_progress"`.
8. **PATCH /steps/{id}** with `{ "doneAt": "2020-01-01T00:00:00.000Z" }` → `400`: `{ "field": "doneAt", "code": "whitelistValidation" }`. The time is the server's.
9. **DELETE /steps/{id}** on the middle step → `204`. **POST /tasks/{taskId}/steps** with `{ "title": "Build a query" }`. **GET /tasks/{taskId}/steps** → the new step is last. In pgAdmin (<http://localhost:5050>), the `position` column of those steps reads 1, 3, 4: the gap the API does not show.
10. **POST /goals/{id}/archive**. Now **POST /tasks/{taskId}/steps**, **PATCH /steps/{id}** and **DELETE /steps/{id}** all answer `409` with `"code": "goal.archived"`, and **GET /tasks/{taskId}/steps** still answers `200`. Then **POST /goals/{id}/unarchive**.
11. **DELETE /steps/{id}** twice on one step → `204`, then `404` with `"code": "step.not_found"`.
