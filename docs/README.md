# Documentation

This folder explains how Your Guide is built, one step at a time.

The code shows *what* we built. These pages explain *why* we built it, in the order we built it.

## How each step is documented

Every step has the same four parts:

| Part | Question it answers |
|---|---|
| **Why** | What problem does this step prevent? What later work needs it? |
| **What we built** | Which files were added or changed? |
| **How it works** | What is the idea, in a few sentences? |
| **Check it** | Which command proves it works, and what should I see? |

A step is finished only when its **Check it** part passes.

## Contents

| Week | Page | Steps |
|---|---|---|
| 1 | [Foundation](week-01-foundation.md) | Project structure · Type safety · Git hooks · NestJS app + config · PostgreSQL in Docker · Database module · Health endpoint + e2e tests · Initial migration |

| 2 | [Auth](week-02-auth.md) | Register · Login + logout · Global guard + `/auth/me` · Rate limit on register and login · Swagger UI |
| 3 | [Profile, onboarding, goals and tasks](week-03-profile-goals-tasks.md) | Profile · Onboarding: the database · Onboarding: screens 1–6 · (values, direction, goals, tasks: not built yet) |

Weeks 3–12 are added here as we build them.

## Other documents

| File | What it holds |
|---|---|
| [`PROJECT.md`](../PROJECT.md) | The product: the problem, the solution, the features, the rules |
| [`SCHEMA.md`](../SCHEMA.md) | The database: every table and why it exists |
| [`DECISIONS.md`](../DECISIONS.md) | Every important decision, with the reason |

## Run the backend

You need Node.js 24+, pnpm, and Docker.

```bash
cd backend
pnpm install
cp .env.example .env
docker compose up -d --wait   # starts PostgreSQL on port 5433
pnpm migrate up               # creates the tables
pnpm dev                      # starts the API on port 3001
```

Then open <http://localhost:3001/api/health>. You should see `{"status":"ok"}`.

To try every route from the browser, open <http://localhost:3001/api/docs> (Swagger UI).

To look at the tables, open pgAdmin at <http://localhost:5050>.

## Adding a new step

1. Finish the step and make its check pass.
2. Open the page for its week (create `week-NN-name.md` for a new week and add it to **Contents**).
3. Add a section with the four parts above.
