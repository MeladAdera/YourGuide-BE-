# Week 4 — Steps

Week 3 ended with tasks: a goal cut into pieces of work. This week cuts a task into steps, the unit a person actually sits down to do, and lets them be put in order. Every route here follows the same two rules as week 3: the `userId` comes from the session cookie and every query filters by it, and an archived goal is read-only.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Steps](#step-1--steps) | YOU-20 | Done |
| 2 | [Reorder steps](#step-2--reorder-steps) | YOU-21 | Done |

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

---

## Step 2 — Reorder steps

### Why

The order of the steps is the plan. "What do I do next?" has one answer: the first step that is not done. That answer is only as good as the order.

And nobody gets the order right the first time. You add "Build a query" last, then see it needs "Practice JOIN" before it and not after. Or the AI helper (week 6) suggests five steps and two are the wrong way round. Without this step the only way to move one is to delete it and add it again, and a step that has a focus session cannot be deleted at all.

It is built now because:

- **The steps screen (week 9) needs one call.** Drag a step, let go, and the frontend sends the new order once.
- **It settles what step 1 left open.** Deleting a step leaves a gap in the positions. A reorder writes them 1 to n again.
- **It needs a change in the database**, and that is easier before any real data depends on the old behaviour.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `migrations/0009_step-position-deferrable.sql` | Database | `UNIQUE (task_id, position)` becomes `DEFERRABLE INITIALLY IMMEDIATE` |
| `src/steps/dto/reorder-steps.dto.ts` | Boundary | `stepIds`: a list of UUIDs, each at most once |
| `src/steps/steps.repository.ts` | Repository | `reorder`: one `UPDATE` |
| `src/steps/steps.service.ts` | Service | `reorder`: lock, "yours? active?", compare the list, write |
| `src/steps/steps.controller.ts` | Controller | `PUT /api/tasks/:taskId/steps/order` |
| `src/common/api-error.ts` | Rule | `step.order_mismatch` |
| `test/steps.e2e-spec.ts` | Test | 21 new tests, 62 in the file |
| `test/schema.e2e-spec.ts` | Test | One statement can swap two positions; a real duplicate is still refused |
| `test/api-docs.e2e-spec.ts`, `test/api-docs-examples.e2e-spec.ts` | Test | Know the new path; the examples test fills `stepIds` with a real id |

### How it works

**The route**

```
PUT /api/tasks/:taskId/steps/order
{ "stepIds": ["<id of C>", "<id of A>", "<id of B>"] }

200 OK
[ { C }, { A }, { B } ]
```

The list is every step of the task, each once, first to last. The answer is the steps in their new order.

| Problem | Status | Code |
|---|---|---|
| No cookie, or the session is gone | `401` | `auth.not_logged_in` |
| No list, something that is not a list, an id that is not a UUID, **the same id twice**, an unknown field | `400` | `validation.failed` |
| **A step is missing**, or an id is not a step of this task (**another task's step**, another user's, or no step at all) | `400` | `step.order_mismatch` |
| A `taskId` in the path that is not a UUID | `400` | `bad_request` |
| No task with that id, or it belongs to someone else | `404` | `task.not_found` |
| The goal is archived | `409` | `goal.archived` |

*Why the whole list, and not "move this step up"?* The client already knows the order it wants: the user dragged a step and let go. One list says it in one call. "Move up" three times is three calls, and if the second one fails, the steps are in an order nobody chose.

*Why `PUT`?* The body is the whole order, and sending it twice leaves the same order. That is what `PUT` means: "make it this".

**1. The database: a constraint that waits for the statement to finish** (`migrations/0009_step-position-deferrable.sql`)

Positions are unique inside a task. Until now PostgreSQL checked that after every single row:

```text
before      A=1  B=2  C=3
wanted      C=1  A=2  B=3

row A:  1 → 2     but B is still 2   →  error, the whole UPDATE is undone
```

The result would have been fine. Only the moment in between was not.

`DEFERRABLE` tells PostgreSQL to look when the statement has finished, when every row has its new position. `INITIALLY IMMEDIATE` means "finished" is the end of each statement, not the end of the transaction.

*Why not `INITIALLY DEFERRED`, as the issue says?* That would move the check to `COMMIT`. A real duplicate, from a bug in adding a step for example, would then be reported at the end of the transaction, far from the statement that made it. With "immediate" it still fails at its own `INSERT`. And nothing needs more: the reorder is one statement.

Before writing the migration we tried all three against PostgreSQL 16, with temporary tables in a transaction that was rolled back:

| Constraint | Reorder three rows in one `UPDATE` | A real duplicate |
|---|---|---|
| plain `UNIQUE` | refused: `duplicate key value` | refused |
| `DEFERRABLE INITIALLY IMMEDIATE` | accepted | refused, by the statement that made it |
| `DEFERRABLE INITIALLY DEFERRED` | accepted | the `INSERT` is accepted; the error comes at `COMMIT` |

The schema test `lets one statement swap the positions of two steps` keeps both halves true.

**2. One statement writes the order** (`StepsRepository.reorder`)

```sql
UPDATE steps SET position = ordered.place
  FROM unnest($3::uuid[]) WITH ORDINALITY AS ordered(id, place)
 WHERE steps.id = ordered.id
   AND steps.task_id = $2 AND steps.user_id = $1
```

`unnest($3::uuid[]) WITH ORDINALITY` turns the list of ids into a small table:

```text
id          place
<id of C>   1
<id of A>   2
<id of B>   3
```

and each step takes the place of its id. Because it is one statement, either every step moves or none does, and no code has to undo anything. Positions come out 1 to n, so a gap left by a delete is closed.

**3. The rules, in one transaction** (`StepsService.reorder`)

```ts
const goal = await this.goals.findLockedOfTask(client, userId, taskId);
requireActive(goal, 'task.not_found');              // yours? 404.  active? 409.
if (!(await this.tasks.lock(client, userId, taskId))) { … 404 }
const current = await this.steps.list(client, userId, taskId);
if (!sameIds(current.map((s) => s.id), input.stepIds)) {
  throw new ApiError('step.order_mismatch');        // 400
}
await this.steps.reorder(client, userId, taskId, input.stepIds);
return this.steps.list(client, userId, taskId);
```

*Why must the list be exactly the task's steps?* A step left out would keep its old position and could collide with a new one. A step from another task has no place in this order. So: every step, each once, nothing else.

*Why lock the task?* It is the lock that adding a step takes (step 1). While the reorder holds it, no step can be added. So the steps the list was compared with are still the task's steps when the order is written.

*Why the same `400` for every wrong list?* The client does the same thing in each case: fetch the steps again and let the user retry. And an id from someone else's task must be answered exactly like an id that does not exist, or the answer would say that it exists. A test compares the two answers.

*Where is a repeated id caught?* In the DTO (`@ArrayUnique`), before the database is asked anything. `sameIds` would catch it too: it sorts both lists and compares them, so a repeated id cannot stand in for a missing one.

**4. The Swagger example, the one that cannot be right**

Every other request example on the docs page can be sent exactly as pre-filled. This one cannot: the body must name *your* steps, and the page cannot know their ids. The example shows the shape with two made-up ids, and the description says where to get real ones. Sent as it is, it answers `400` with `step.order_mismatch`, which is the correct answer.

The test that sends every example (`test/api-docs-examples.e2e-spec.ts`) does what a person does: it replaces the ids in `stepIds` with the id of the step its own example created a moment before.

**5. The tests**

| Rule (from the issue's *Done when*) | Test |
|---|---|
| Reorder three steps, and the list returns the new order | `puts three steps in a new order and answers with it` |
| The same id twice is `400` | `refuses the same id twice: 400, order unchanged` |
| A missing id is `400` | `refuses a list with a step missing: 400, order unchanged` |
| Another task's step is `400` | `refuses another task's step: 400, both orders unchanged` |

And the rest:

| Rule | Test |
|---|---|
| Only the order changes | `keeps what each step holds: its title and whether it is done` |
| Positions become 1 to n | `writes positions 1 to n, closing the gap a delete left` |
| A later add still goes last | `puts a step added afterwards last` |
| Safe to repeat | `accepts the order the steps already have` |
| An id in capitals is the same id | `accepts ids written in capitals` |
| A task with no steps takes an empty list | `accepts an empty list for a task with no steps` |
| One task's order does not touch another's | `leaves the order of another task alone` |
| An unknown id, added or in place of one; an empty list | three more cases of `refuses a list with …` |
| Someone else's step looks like no step | `refuses another user's step exactly like an id that does not exist` |
| A body of the wrong shape | five cases of `refuses a body with …` |
| An archived goal refuses it | `an archived goal is read-only › refuses to reorder: 409` |
| `404`, `400` and `401` | the "every endpoint" tests from step 1 now call this route too |
| The constraint itself | `lets one statement swap the positions of two steps` (schema) |

### Check it

```bash
pnpm migrate up
pnpm test:e2e
```

`0009_step-position-deferrable` is applied, and all 316 tests pass.

Try it in Swagger UI (<http://localhost:3001/api/docs>, with `pnpm dev` running). In Apidog, import `http://localhost:3001/api/docs-json` again first.

1. **GET /tasks/{taskId}/steps** for a task with at least three steps (add some with **POST** if needed). Copy the ids, in order.
2. **PUT /tasks/{taskId}/steps/order** → replace the two example ids with your ids, the last one first → *Execute* → `200`, and the steps come back in the order you sent.
3. **GET /tasks/{taskId}/steps** → the same order. It was saved.
4. *Execute* the same **PUT** again → `200`, the same order. It is safe to repeat.
5. Leave one id out → `400` with `"code": "step.order_mismatch"`.
6. Put one id in twice → `400` with `"code": "validation.failed"` and `{ "field": "stepIds", "code": "arrayUnique" }`.
7. Send the example exactly as pre-filled → `400` with `step.order_mismatch`. Those ids are nobody's steps.
8. **GET /tasks/{taskId}/steps** → still the order from step 2. None of the refused calls changed anything.
9. In pgAdmin (<http://localhost:5050>):

   ```sql
   SELECT title, position FROM steps WHERE task_id = '<task id>' ORDER BY position;
   ```

   The positions are 1, 2, 3 with no gap, also if step 1's check had left them at 1, 3, 4.
10. **POST /goals/{id}/archive**, then the **PUT** again → `409` with `"code": "goal.archived"`. Then **POST /goals/{id}/unarchive**.

