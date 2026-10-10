# Your Guide — Project Definition

A work/study manager that helps people plan their goals, break them into small steps, and **keep going when they want to give up**.

Built for my own problem first, open to other people too.

---

## 1. The Problem

I know my goals and I know my tasks. Planning is not the problem.

The problem happens **during the work, when I'm alone**:

- I get **stuck** on a hard problem.
- I get **tired**.
- I **compare** myself to others.
- A **negative thought** appears ("this isn't real", "I won't make it").

Motivation videos help before I start, but in that moment nobody is next to me to say:
"Look at your progress. This hard part is where you grow. Here is your next small step."

## 2. The Solution

An app that plays that missing role:

1. It knows **my goal and why it matters to me** (asked at onboarding).
2. It helps me **break goals into tasks and small steps**.
3. It tracks **focus sessions**, **reviews**, and **progress**, so I have proof I'm moving.
4. When I struggle, it **assesses my situation** and gives advice that fits, using AI.
5. It **remembers my past struggles**, so advice becomes more personal over time.

## 3. Scope Decisions

| Decision | Choice |
|---|---|
| Users | Me and other people (email + password accounts) |
| Platform | Web app (browser) |
| Languages | English and Arabic. The frontend translates; the API answers with codes |
| Frontend | Next.js (App Router) + TypeScript |
| Backend | NestJS + TypeScript |
| Database | PostgreSQL, raw SQL with `pg` (no ORM) |
| Migrations | `node-pg-migrate` with plain SQL |
| Validation | `class-validator` DTOs + global `ValidationPipe` |
| AI | Anthropic SDK, called from backend only |
| Auth | Email + password (argon2 hash), server-side sessions in Postgres, httpOnly cookie |
| Charts | Recharts |
| Repo | One git repo, two independent projects: `backend/` and `frontend/` (each with its own `package.json`, no shared package) |

**Out of scope for now:** mobile app, notifications, teams/sharing, integrations, email verification, password reset, OAuth login.

## 4. Architecture

```
Browser
   │
   ▼
Next.js (frontend)  ── rewrites /api/* ──►  NestJS (backend)  ──►  PostgreSQL
                                                   │
                                                   └──►  Anthropic API
```

- Next.js rewrites `/api/*` to the NestJS server. The browser sees **one origin**, so there is no CORS and the auth cookie works simply.
- Next.js is UI only. All business logic lives in NestJS.
- A global auth guard protects every route except register/login. It reads the cookie, finds the session, and attaches `userId` to the request.

### Repo structure

```
your-guide/
├── backend/            # NestJS, its own package.json
│   ├── src/
│   ├── test/           # e2e tests (real database)
│   ├── migrations/     # SQL migrations
│   └── docker-compose.yml
└── frontend/           # Next.js, its own package.json (week 8)
```

The two projects share no code. The frontend declares the API request/response types it uses itself.

### NestJS structure

Each feature module has three layers, one responsibility each:

| Layer | Responsibility |
|---|---|
| Controller | HTTP: routes, DTO validation, status codes |
| Service | Business rules |
| Repository | Raw SQL queries with `pg` |

Modules:

```
src/
├── config/        # loads + validates env vars, throws on startup if missing
├── database/      # provides one pg Pool
├── auth/          # register/login/logout, global guard, attaches current user
├── profile/
├── goals/
├── tasks/
├── steps/
├── sessions/
├── struggles/
├── progress/
└── ai/            # all Anthropic calls
```

## 5. Core Flow

```
Onboarding (7 screens: who I am → where I am → what matters)
        ↓
First goal + why  (the wizard's last step, an ordinary goal)
        ↓
Goal → Tasks → Steps
        ↓
Pick a step → Focus session (timer)
        ↓                      ↘
Session review            "I'm struggling" button
        ↓                      ↓
Evaluation              Choose situation + describe problem
        ↓                      ↓
Progress chart ←──── AI advice + one small next step
```

## 6. Features

### 6.1 Onboarding
Seven short screens about the person, each saved on its own, each opening with one line that says why it asks. Then the wizard's last step: the first goal. Answers are editable later and feed every AI advice. The order follows the arc of the app: who am I → where am I now → what matters to me → where do I want to go → why → what is stopping me.

| # | Screen | Asks | Required |
|---|---|---|---|
| 1 | Basics | employment status; optional: age range, country, education level, occupation, years of experience | status only, screen can be skipped |
| 2 | Your days now | typical day; what you would most like to change; optional: satisfied with, wish more time for | 2 |
| 3 | What you have done | something you achieved, got through or surprised yourself with; optional: what was hard, what you learned about yourself | 1 |
| 4 | What gets in the way | what you keep postponing or avoiding; optional: a mistake or regret that taught you something, a habit or pattern to change | 1 |
| 5 | How you see yourself | "Describe yourself honestly. Who are you at this point in your life?"; optional: good at, what others come to you for, still figuring out | 1 |
| 6 | Quick check-in | 8 statements, 1 (strongly disagree) to 5 (strongly agree) | 8 taps |
| 7 | What matters to you | 2–5 values from a fixed list, each with an optional note; the person you want to become; optional: would regret not doing, remembered for | picks + 1 |
| then | Your first goal | goal, why it matters; optional: what might get in the way, first outcome | 2. An ordinary goal (6.2), created with `POST /api/goals` |

Rules:
- **The goal comes last.** Values before plans: the goal is written after the person has recalled what they can do, named what they avoid and chosen what matters.
- Screen 1 is optional. Onboarding is complete when screens 2–7 are saved. Until then the backend refuses to create a goal, with `409`.
- **A goal lives in one place.** The first goal is not a profile field: the wizard's last step creates a row in `goals`, exactly as every later goal is created. Nothing is typed twice.
- Eight written answers are required in total, the first goal's two included. Everything else is a tap or optional, and the more personal questions are the optional ones.
- **The app never diagnoses.** It never says "you have low self-esteem" or names any condition. The check-in stores eight answers and no score.
- We collect only what a feature reads: no city, address, birthdate, languages, field of study, gender or health. Age is a range; location is a country.

### 6.2 Goals, Tasks, Steps
- Create a goal with why it matters; optionally what might get in the way and the first outcome. Every goal carries its own why. A goal without work history can be **deleted**; a goal with history is **archived**, so progress keeps it. An archived goal is read-only: nothing under it changes until it is unarchived. A goal cannot be archived while a focus session is running under it.
- Add tasks under a goal. A task's status is never set by hand: it is read from its steps (to do, in progress, done), so a task is **done automatically** when all its steps are done.
- Break each task into small steps. A step must be small enough to finish in one session.
- AI helper: "Break this task into steps" (suggests steps, I accept or edit).

### 6.3 Focus Session
- Pick one step that is not done, start a timer. The start time is the server's.
- A session is **active** until it is reviewed: *running* while the clock counts, *awaiting review* once the clock is stopped without a review.
- Only **one active session per user** at a time (enforced by the database). Nothing else starts, and the goal above it is not archived, until the session is reviewed.
- Nothing closes a session but the user. Leaving the app leaves the clock running; the session is there when they come back.
- "Later" on the review screen stops the clock. The review is still owed and can be written at any later time; the minutes stay those of the clock.
- A session cannot end without its review: outcome and rating are required, the note is optional.
- A session started by mistake cannot be cancelled or discarded. It is ended like any other, with its review.

### 6.4 Session Review
When a session ends:
- Outcome: `done` / `progress` / `stuck` / `distracted` / `tired`
- What did I do? (short note)
- Rating of the session: 1–5
- Outcome `done` marks the step as done automatically, as of the time the clock stopped. The other four leave it as it is.
- The end time is the server's: when the clock was stopped, or the moment of the review if it was not stopped first. A session is reviewed once; the review cannot be changed afterwards.

### 6.5 Evaluation (later phase)
- For study tasks: AI generates a short quiz from my session notes.
- Score is saved and shown in progress.

### 6.6 "I'm Struggling" Button
Available anytime, especially during a session.
1. Choose situation: `stuck` / `tired` / `comparing` / `negative_thought`
2. Describe the problem in my own words.
3. Backend sends to AI:
   - my goal and my "why"
   - current task and step
   - my recent progress (last 7 days)
   - my last few struggles and whether I continued after them
4. AI returns:
   - short advice that fits the situation
   - **one small next step**
5. After, I mark: did I continue? (`continued` / `stopped`)

### 6.7 Progress
- Focus minutes per day
- Steps completed per day
- **Times I struggled and continued anyway** (the most important number)

## 7. Database Schema

The full schema, its rules, and the reasons behind them live in **`SCHEMA.md`**. That file is the single source of truth for the database.

**Ownership rule:** every table that holds user data has `user_id`, and every repository query filters by it (`WHERE id = $1 AND user_id = $2`). A row that doesn't belong to the current user is treated as not found (404).

## 8. API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account, set cookie. The browser sends its `timezone` and the `locale` it is showing |
| POST | `/api/auth/login` | Check password, set cookie |
| POST | `/api/auth/logout` | Delete session, clear cookie |
| GET | `/api/auth/me` | Current user |
| PATCH | `/api/auth/me` | Change the language the app shows (`locale`: `en` or `ar`) |
| GET | `/api/profile` | The seven onboarding screens. 404 until onboarding is complete (screens 2–7 saved) |
| GET | `/api/profile/onboarding` | Which screens are saved and whether onboarding is complete |
| GET / PUT | `/api/profile/sections/{screen}` | One onboarding screen: `basics`, `situation`, `achievements`, `patterns`, `self-view`, `confidence`, `values` |
| GET / POST | `/api/goals` | List (`?archived=true` for the archived ones) / create a goal with its why. `POST` is 409 until onboarding is complete |
| PATCH | `/api/goals/:id` | Change a goal: only the fields that are sent |
| DELETE | `/api/goals/:id` | Delete goal (409 if it has work history) |
| POST | `/api/goals/:id/archive` | Archive goal (409 while a focus session is running under it) |
| POST | `/api/goals/:id/unarchive` | Unarchive goal |
| GET / POST | `/api/goals/:goalId/tasks` | List the goal's tasks, each with its status / create a task (409 if the goal is archived) |
| PATCH / DELETE | `/api/tasks/:id` | Rename / delete task (409 if the goal is archived, or the task has work history) |
| GET / POST | `/api/tasks/:taskId/steps` | List the task's steps in order / create a step, placed last (409 if the goal is archived) |
| PUT | `/api/tasks/:taskId/steps/order` | Put the task's steps in a new order: `stepIds`, every step once (409 if the goal is archived) |
| PATCH / DELETE | `/api/steps/:id` | Rename, mark done or not done / delete step (409 if the goal is archived, or the step has work history) |
| GET | `/api/sessions/active` | The active session, running (`endedAt` null) or awaiting its review, with its step, task and goal by name. 404 when none is active |
| POST | `/api/sessions` | Start session (`stepId`). 409 if the goal is archived, the step is done, or a session is still active |
| POST | `/api/sessions/:id/stop` | Stop the clock without a review ("Later"). The session stays active until it is reviewed. 404 if it is not running |
| POST | `/api/sessions/:id/end` | End a running or stopped session with its review: `outcome`, `rating`, optional `note`. `done` marks the step done as of the end time. 404 if it is not active, or not yours |
| POST | `/api/struggles` | Describe struggle → AI advice |
| PATCH | `/api/struggles/:id` | Mark continued / stopped |
| GET | `/api/progress?days=7` | Per day in the user's timezone, oldest first, today last: focus minutes, steps done, times struggled and continued; plus the totals. `days` from 1 to 90 |
| POST | `/api/tasks/:id/breakdown` | AI suggests steps (phase 6) |

## 9. Environment Variables

Validated at startup in `config/`. The app **throws and does not start** if one is missing.

| Variable | Used by |
|---|---|
| `DATABASE_URL` | api |
| `TRUST_PROXY` | api (optional, default 0: how many proxies are in front, set at deploy so the rate limit sees the real client IP) |
| `ANTHROPIC_API_KEY` | api (added in phase 5) |
| `API_URL` | web (rewrite target) |

## 10. Build Plan

12 weeks: **backend in weeks 1–7, frontend in weeks 8–12.** The week-by-week plan lives in **`BACKEND_PLAN.md`**.

## 11. Engineering Rules

- Simple beats complex. One way to do things.
- Fail fast: throw errors when preconditions aren't met (missing env vars, missing profile, ending a session that already ended).
- AI calls only in the backend. The API key never reaches the browser.
- Let TypeScript catch errors; validate only at boundaries (request DTOs, AI responses).
- SQL lives only in repositories. Services never write SQL.
- Every repository method takes `userId`. No query on user data without it.
- Rate limit `register` and `login` (`@nestjs/throttler`).
- The app never states or stores a diagnosis. Reflection answers are signals for personalisation, never labels or scores.
- The API speaks codes, the frontend speaks languages. An error is a code from `src/common/api-error.ts`; a fixed list is codes. No sentence for the user is written in the backend, except by the AI.
- Write every important decision in `DECISIONS.md` with the reason.

## 12. Open Questions (decide later)

- Whether users can retake the check-in over time (that would turn `profile_confidence` into a history table).
- Exact prompt for each struggle situation.
- Quiz format for evaluation.
- AI usage limit per user per day (AI calls cost money once other people use it).
- Password reset and email verification (needs email sending).
- Hosting (e.g. Vercel for web, Railway/Render for api + Postgres).
