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
Onboarding (goal + why)
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
Asked once, editable later. Answers are used in every AI advice.
- What is your main goal?
- Why do you want to achieve it?
- What usually stops you?
- (Full question list: decided later.)

### 6.2 Goals, Tasks, Steps
- Create a goal. A goal without work history can be **deleted**; a goal with history is **archived**, so progress keeps it.
- Add tasks under a goal. A task is **done automatically** when all its steps are done.
- Break each task into small steps. A step must be small enough to finish in one session.
- AI helper: "Break this task into steps" (suggests steps, I accept or edit).

### 6.3 Focus Session
- Pick one step, start a timer.
- Only **one active session per user** at a time (enforced by the database).
- End the session manually.

### 6.4 Session Review
When a session ends:
- Outcome: `done` / `progress` / `stuck` / `distracted` / `tired`
- What did I do? (short note)
- Rating of the session: 1–5
- Outcome `done` marks the step as done automatically.

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
| POST | `/api/auth/register` | Create account, set cookie |
| POST | `/api/auth/login` | Check password, set cookie |
| POST | `/api/auth/logout` | Delete session, clear cookie |
| GET | `/api/auth/me` | Current user |
| GET / PUT | `/api/profile` | Onboarding answers |
| GET / POST | `/api/goals` | List / create goals |
| PATCH | `/api/goals/:id` | Rename goal |
| DELETE | `/api/goals/:id` | Delete goal (409 if it has work history) |
| POST | `/api/goals/:id/archive` | Archive goal |
| POST | `/api/goals/:id/unarchive` | Unarchive goal |
| POST | `/api/goals/:goalId/tasks` | Create task |
| PATCH / DELETE | `/api/tasks/:id` | Update / delete task (409 if it has work history) |
| POST | `/api/tasks/:taskId/steps` | Create step |
| PATCH / DELETE | `/api/steps/:id` | Update / delete step (409 if it has work history) |
| GET | `/api/sessions/active` | Current running session |
| POST | `/api/sessions` | Start session (`stepId`) |
| POST | `/api/sessions/:id/end` | End session + review |
| POST | `/api/struggles` | Describe struggle → AI advice |
| PATCH | `/api/struggles/:id` | Mark continued / stopped |
| GET | `/api/progress?days=7` | Progress data for charts |
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
- Write every important decision in `DECISIONS.md` with the reason.

## 12. Open Questions (decide later)

- Full onboarding question list.
- Exact prompt for each struggle situation.
- Quiz format for evaluation.
- AI usage limit per user per day (AI calls cost money once other people use it).
- Password reset and email verification (needs email sending).
- Hosting (e.g. Vercel for web, Railway/Render for api + Postgres).
