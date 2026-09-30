# Week 2 — Auth

This week the app learns who is using it. Every table of user data has `user_id`, so no feature can be built or tested until there is a user.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Register](#step-1--register) | YOU-13 | Done |
| 2 | Login + logout | YOU-14 | Not started |
| 3 | Global guard + `GET /auth/me` | YOU-15 | Not started |
| 4 | Rate limit on register and login | YOU-16 | Not started |

All commands on this page run inside `backend/`.

---

## Step 1 — Register

### Why

Register is the first request that creates real data. It also sets three security habits that the rest of the app depends on:

- **The password is never stored.** Only an argon2 hash is. If the database leaks, nobody can read the passwords.
- **The database decides if an email is taken.** Two people registering the same email at the same moment cannot both win, because the unique index allows only one.
- **The login token is never stored either.** The browser holds the token in a cookie; the database holds only its hash. A leaked database cannot be used to log in as someone.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `migrations/0002_add-user-timezone.sql` | Database | Adds `users.timezone` |
| `src/auth/dto/register.dto.ts` | Boundary | What a valid request looks like |
| `src/auth/auth.controller.ts` | Controller | The route; sets the cookie |
| `src/auth/auth.service.ts` | Service | Hashes, saves, turns a duplicate into 409 |
| `src/auth/users.repository.ts` | Repository | `INSERT INTO users` |
| `src/auth/auth-sessions.repository.ts` | Repository | `INSERT INTO auth_sessions` |
| `src/auth/session-cookie.ts` | Helper | The cookie name and its settings |
| `src/auth/auth.module.ts` | Module | Connects the pieces |
| `src/database/pg-errors.ts` | Helper | Recognises PostgreSQL's "duplicate" error |
| `src/config/app-config.ts` | Config | New: `isProduction` |
| `test/auth-register.e2e-spec.ts` | Test | 11 e2e tests |

### How it works

**The request**

```
POST /api/auth/register
{ "email": "you@example.com", "password": "at least 8 characters", "timezone": "Asia/Dubai" }
```

**The answer**

```
201 Created
Set-Cookie: your_guide_session=<token>; Path=/; Expires=<30 days>; HttpOnly; SameSite=Lax
{ "id": "…", "email": "you@example.com", "timezone": "Asia/Dubai" }
```

| Problem | Status |
|---|---|
| Invalid email, password shorter than 8, invalid timezone, unknown field | `400` |
| Email already registered (any letter case) | `409` |

**The path of one request**

```
Request
   ↓
RegisterDto          is the input valid?            no → 400
   ↓
AuthController       calls the service
   ↓
AuthService          1. hash the password (argon2)
                     2. in ONE transaction:
                          save the user
                          save the login session
                     3. duplicate email?             yes → 409
   ↓
AuthController       sets the cookie, returns the user
```

**Why the timezone**

The progress page counts work per day. A session at 01:30 on Tuesday in Dubai is 21:30 on Monday in UTC. Without the user's timezone it would be counted on the wrong day. The browser sends the timezone at register, and the API checks it is a real one.

Schema v1 had no timezone column, so this step starts with a second migration. We never edit `0001_initial.sql`; a change to the database is always a new file.

**Why argon2, and why before the transaction**

A password hash is slow on purpose (about 0.1 second). That is nothing for one login, but it makes guessing millions of passwords too expensive.

Because it is slow, the service hashes **before** it opens the transaction. A transaction holds a database connection, and we do not want to hold one while doing slow work that does not need the database.

**Why one transaction**

Register writes two rows: the user and the login session. If the second write failed after the first, we would have an account whose owner was told "error" and is not logged in. `withTransaction` (week 1, step 6) saves both or neither.

**Why the database answers "is this email taken?"**

The code does not run `SELECT` first to check. It just inserts. If the email exists, PostgreSQL refuses with error `23505` on the index `users_email_unique`, and the service turns that into `409`.

A check in code has a gap: two requests can both check, both see "free", and both insert. The unique index has no gap. The index is on `lower(email)`, so `Foo@x.com` and `foo@x.com` are the same email.

**The login session**

| Where | What is kept |
|---|---|
| Browser cookie | The token: 32 random bytes |
| `auth_sessions.token_hash` | SHA-256 of the token |

The cookie settings:

| Setting | Meaning |
|---|---|
| `HttpOnly` | JavaScript in the page cannot read the cookie, so a script injected into the page cannot steal it |
| `SameSite=Lax` | The cookie is not sent on requests that other websites start (except plain links) |
| `Secure` | Sent over HTTPS only. On in production, off on `http://localhost` |
| `Expires` | 30 days |

`Secure` is decided by `AppConfig.isProduction`, which is true when `NODE_ENV` is `production`.

**What the API never returns**

The `User` type has `id`, `email`, and `timezone`. The SQL uses `RETURNING id, email, timezone`, so the password hash never leaves the repository.

### Check it

```bash
pnpm migrate up
pnpm test:e2e
```

The 11 register tests pass.

Try it for real, with `pnpm dev` running:

```bash
curl -i -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"correct horse battery","timezone":"Asia/Dubai"}'
```

You get `201` and a `Set-Cookie` header. Run it a second time and you get `409`.

Then open pgAdmin (<http://localhost:5050>) and look at the `users` table: the `password_hash` column starts with `$argon2id$`. The `auth_sessions` table has one row for the login.
