# Week 3 — Profile, goals and tasks

Week 2 gave the app a user. This week the user gets data of their own: the onboarding answers, then goals, then tasks. Every route in this week follows one rule from `PROJECT.md`: the `userId` comes from the session cookie, never from the request, and every query filters by it.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Profile](#step-1--profile) | YOU-17 | Done |
| 2 | Goals | YOU-18 | Not started |
| 3 | Tasks | YOU-19 | Not started |

All commands on this page run inside `backend/`.

---

## Step 1 — Profile

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
