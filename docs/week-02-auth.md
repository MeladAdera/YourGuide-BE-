# Week 2 — Auth

This week the app learns who is using it. Every table of user data has `user_id`, so no feature can be built or tested until there is a user.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Register](#step-1--register) | YOU-13 | Done |
| 2 | [Login + logout](#step-2--login-and-logout) | YOU-14 | Done |
| 3 | [Global guard + `GET /auth/me`](#step-3--global-guard-and-get-authme) | YOU-15 | Done |
| 4 | [Rate limit on register and login](#step-4--rate-limit-on-register-and-login) | YOU-16 | Done |

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

---

## Step 2 — Login and logout

### Why

After step 1 a user gets a login session only at register. When the cookie expires or is lost, there is no way back into the account. Login gives a new session to someone who proves they know the password. Logout ends a session before its 30 days are over.

The next two steps also need this one: the guard (step 3) must be able to tell a live session from an ended one, and the rate limit (step 4) needs a login route to protect.

This step adds four security habits:

- **One answer for every failed login.** "No such email" and "wrong password" look exactly the same, so the login form cannot be used to find out who has an account.
- **The same response time, too.** A hash is checked even when the email has no account.
- **Every login gets a new token.** A token is never reused.
- **Logout deletes the session in the database.** Clearing only the cookie would leave a copied token working.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `package.json` | Dependency | New: `cookie-parser` |
| `src/app.setup.ts` | App | Turns the `Cookie` header into `req.cookies` |
| `src/auth/session-cookie.ts` | Helper | New: read the token, clear the cookie |
| `src/auth/dto/login.dto.ts` | Boundary | What a valid login request looks like |
| `src/auth/users.repository.ts` | Repository | New: find a user by email, with the hash |
| `src/auth/auth-sessions.repository.ts` | Repository | New: delete a session, delete expired sessions |
| `src/auth/auth.service.ts` | Service | New: `login`, `logout`, the dummy hash |
| `src/auth/auth.controller.ts` | Controller | New: the two routes |
| `test/helpers/session-cookie.ts` | Test helper | Reads the cookie from a response |
| `test/auth-login.e2e-spec.ts` | Test | 12 e2e tests |
| `test/auth-logout.e2e-spec.ts` | Test | 5 e2e tests |

### How it works

**The requests**

```
POST /api/auth/login
{ "email": "you@example.com", "password": "your password" }

200 OK
Set-Cookie: your_guide_session=<new token>; Path=/; Expires=<30 days>; HttpOnly; SameSite=Lax
{ "id": "…", "email": "you@example.com", "timezone": "Asia/Dubai" }
```

```
POST /api/auth/logout
Cookie: your_guide_session=<token>

204 No Content
Set-Cookie: your_guide_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
```

| Problem | Status |
|---|---|
| Invalid email, missing or empty password, password longer than 128, unknown field | `400` |
| Email not registered, or wrong password | `401` with `Invalid email or password.` |
| Logout with no cookie, or with a token that does not exist | `204` (already logged out) |

**The path of a login**

```
Request
   ↓
LoginDto             is the input valid?                 no → 400
   ↓
AuthController       calls the service
   ↓
AuthService          1. find the user by email
                     2. check the password against a hash
                          user found  → their hash
                          no user     → the dummy hash
                     3. no user, or no match?            yes → 401
                     4. delete this user's expired sessions
                     5. save a new login session
   ↓
AuthController       sets the cookie, returns the user
```

**The path of a logout**

```
Request
   ↓
AuthController       read the token from the cookie
                     token found → AuthService deletes its row in auth_sessions
                     clear the cookie
   ↓
204
```

We built it in five small steps. Read the files in this order.

**1. Let the server read cookies** (`src/app.setup.ts`, `src/auth/session-cookie.ts`)

Until now the server only *sent* a cookie. Logout is the first route that must *read* it, to know which session to delete. Express does not parse the `Cookie` header by itself, so `configureApp` adds `cookie-parser`. The guard in step 3 uses the same reader.

`session-cookie.ts` has two new helpers:

- `readSessionToken(req)` returns the token, or `undefined` when there is no session cookie.
- `clearSessionCookie(res, secure)` tells the browser to remove the cookie.

The cookie settings now live in one function, used for setting and for clearing. A browser only removes a cookie when the clearing settings (for example `Path`) match the ones it was set with.

**2. The login input** (`src/auth/dto/login.dto.ts`)

The DTO has an email and a password. It is different from register in one way: there is no "at least 8 characters" rule. Login does not judge a password; it only checks it against the stored hash. The upper limit of 128 stays, so nobody can send a huge password to keep the server busy hashing it.

**3. The database queries** (`src/auth/users.repository.ts`, `src/auth/auth-sessions.repository.ts`)

SQL lives only in repositories, so the two new queries go there.

```sql
SELECT id, email, timezone, password_hash
  FROM users
 WHERE lower(email) = lower($1)
```

`lower(email)` is the same expression as the unique index `users_email_unique`. So `Foo@x.com` finds `foo@x.com`, and PostgreSQL uses the index to find the row.

The method returns `{ user, passwordHash }`: the hash sits *next to* the user, not inside it. The `User` that the controller sends to the browser still has no field that could hold it.

```sql
DELETE FROM auth_sessions WHERE token_hash = $1
```

The server hashes the token from the cookie and deletes the row with that hash. It deletes one session only. A login on another device stays.

```sql
DELETE FROM auth_sessions WHERE user_id = $1 AND expires_at <= now()
```

Run at every successful login. An expired session is a useless row, and nothing else removes it. Each user removes their own at login, so the table does not grow forever and we need no cleanup job. Only expired rows go: a live session on another device stays. Both queries use the index `auth_sessions_user_idx`.

**4. The logic** (`src/auth/auth.service.ts`, `src/auth/auth.controller.ts`)

*One answer for every failed login.* Both cases throw the same `401` with the same message. If they were different, anyone could type emails into the login form and learn who has an account.

*The dummy hash.* Checking a password takes about 0.1 second, on purpose. If login skipped the check when the email has no account, that case would answer much faster, and the response time alone would reveal which emails exist. So the service always checks a hash:

```ts
const passwordMatches = await verify(
  found?.passwordHash ?? this.dummyPasswordHash,
  input.password,
);
if (found === undefined || !passwordMatches) {
  throw new UnauthorizedException('Invalid email or password.');
}
```

The dummy hash is made once, when the app starts (`onModuleInit`), with the same argon2 settings as a real password hash. It is the hash of a random value, so no password can match it.

Measured on a running server, 20 requests each: wrong password 140 ms, unknown email 137 ms (median).

*A new token for every login.* `login` calls the same `createSession` as register: 32 new random bytes, and only the SHA-256 hash is stored. An old token gains nothing from a new login.

*No transaction.* Register writes two rows that belong together, so it needs one. Login deletes expired rows and inserts one new row, but the two do not depend on each other: if the cleanup ran and the insert failed, nothing would be wrong.

*Login answers 200, logout 204.* NestJS answers `201 Created` to a `POST` by default. Login does not create something the client asked for, so it answers `200`. Logout has nothing to return, so it answers `204`.

*Logout never fails.* With no cookie, or a token that is not in the database, the user is already logged out. That is the result they asked for, so the answer is still `204`, and the cookie is cleared in every case.

**5. The tests** (`test/auth-login.e2e-spec.ts`, `test/auth-logout.e2e-spec.ts`)

Each rule above has a test, so a later change cannot break it without a test failing.

| Rule | Test |
|---|---|
| The hash never leaves the server | `returns the user without the password` |
| A new token for every login | `creates a new session and stores only a hash of its token` |
| Expired sessions are removed at login, live ones stay | `deletes the expired sessions of this user only` |
| Letter case does not matter | `accepts the email in any letter case` |
| A failed login creates nothing | `rejects a wrong password with 401 and no session` |
| One answer for every failed login | `answers an unknown email exactly like a wrong password` |
| Logout ends the session in the database | `deletes the session from the database` |
| The browser removes the cookie | `tells the browser to remove the cookie` |
| Other devices stay logged in | `ends only the session of this cookie` |
| Logout never fails | `answers 204 when there is no cookie`, `answers 204 for a token that does not exist` |

The small functions that read the cookie from a response moved to `test/helpers/session-cookie.ts`, because three test files now use them.

**What this step leaves for later**

- Anyone can still try passwords as fast as they like. The rate limit is step 4.
- Nothing reads the session yet. A deleted or expired session is only refused once the guard exists (step 3).
- A new login does not end the user's other *live* sessions. They end at logout, or are removed at the first login after they expire.

### Check it

```bash
pnpm test:e2e
```

All 43 tests pass: 12 for login and 5 for logout are new.

Try it for real, with `pnpm dev` running and the account from step 1:

```bash
# 1. Log in. -c saves the cookie to a file, like a browser does.
curl -i -c /tmp/cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"correct horse battery"}'
```

You get `200` and a `Set-Cookie` header. In pgAdmin, `auth_sessions` has one more row.

```bash
# 2. A wrong password, then an email that does not exist.
curl -i -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"wrong password"}'

curl -i -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","password":"wrong password"}'
```

Both give `401` with the same body: `Invalid email or password.`

```bash
# 3. Log out. -b sends the saved cookie back.
curl -i -b /tmp/cookies.txt -X POST http://localhost:3001/api/auth/logout
```

You get `204` and a `Set-Cookie` header with an empty value and the date `01 Jan 1970`. In pgAdmin, the row from command 1 is gone.

---

## Step 3 — Global guard and `GET /auth/me`

### Why

After step 2 the server writes session rows but never reads them. No route is protected: anyone can call anything. This step adds the guard that reads the cookie on every request, and the first route that needs it, `GET /api/auth/me`.

Two decisions here shape every later route:

- **Closed by default.** Every route needs a login unless it is marked `@Public()`. A forgotten `@Public()` shows up at once as a `401`. A forgotten guard would leak data silently. We choose the mistake that is visible.
- **The handler gets a `userId`, nothing more.** The ownership rule in `PROJECT.md` says every query on user data filters by `user_id`. So the id is exactly what every later handler needs, and it comes from the cookie, never from the request body or the URL.

This is the last piece the other weeks depend on: goals, tasks, steps and sessions can now be built as "the current user's" data.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `src/auth/public.decorator.ts` | Decorator | New: `@Public()` marks an open route |
| `src/auth/auth-sessions.repository.ts` | Repository | New: find the owner of a live session |
| `src/auth/auth.guard.ts` | Guard | New: the check that runs before every handler |
| `src/auth/auth.module.ts` | Module | Registers the guard for the whole app |
| `src/auth/current-user.decorator.ts` | Decorator | New: `@CurrentUser()` gives the handler the `userId` |
| `src/auth/users.repository.ts` | Repository | New: find a user by id |
| `src/auth/auth.service.ts` | Service | New: `currentUser` |
| `src/auth/auth.controller.ts` | Controller | New: `GET /me`; register, login, logout marked `@Public()` |
| `src/health/health.controller.ts` | Controller | Marked `@Public()` |
| `test/auth-me.e2e-spec.ts` | Test | 6 e2e tests |

### How it works

**The request**

```
GET /api/auth/me
Cookie: your_guide_session=<token>

200 OK
{ "id": "…", "email": "you@example.com", "timezone": "Asia/Dubai" }
```

| Problem | Status |
|---|---|
| No cookie, unknown token, session expired, or session deleted by logout | `401` with `Not logged in.` |

**The path of every request from now on**

```
Request
   ↓
cookie-parser        Cookie header → req.cookies
   ↓
AuthGuard            is the route marked @Public()?          yes → let it through
                     read the token from the cookie
                     SHA-256 it, look it up:
                       token_hash = ? AND expires_at > now()  no row → 401
                     put userId on the request
   ↓
ValidationPipe       is the body valid?                       no → 400
   ↓
Handler              @CurrentUser() reads the userId
```

The order is fixed by NestJS: middleware (cookie-parser) runs first, then guards, then pipes, then the handler. That is why the guard can read `req.cookies`, and why an invalid body on a protected route still answers `401`, not `400`: the guard runs before validation.

We built it in five small steps. Read the files in this order.

**1. The marker** (`src/auth/public.decorator.ts`)

`@Public()` stores one flag, `isPublic: true`, on the route. The guard reads the flag back. It can sit on one handler or on a whole controller.

**2. The query** (`src/auth/auth-sessions.repository.ts`)

```sql
SELECT user_id
  FROM auth_sessions
 WHERE token_hash = $1 AND expires_at > now()
```

One query answers both questions: does this token exist, and is it still valid. An unknown token and an expired one give the same result, no row, so the guard treats them the same way. `token_hash` is the primary key, so the lookup is one index read.

**3. The guard** (`src/auth/auth.guard.ts`, `src/auth/auth.module.ts`)

```ts
if (isPublic === true) return true;

const token = readSessionToken(request);
const userId = token === undefined
  ? undefined
  : await this.authSessions.findUserIdByTokenHash(this.db.pool, hashToken(token));
if (userId === undefined) {
  throw new UnauthorizedException('Not logged in.');
}
(request as AuthenticatedRequest).userId = userId;
return true;
```

*Why throw, and not `return false`?* A guard that returns `false` makes NestJS answer `403 Forbidden`. That means "I know who you are, and you may not do this". Our case is "I do not know who you are", which is `401`. The frontend will use the difference: `401` means "show the login page".

*Why is it registered in `AuthModule`?* `APP_GUARD` is a special NestJS token: a provider registered under it runs for every route in the whole app, no matter which module provides it. We provide it in `AuthModule` because the guard needs `AuthSessionsRepository`, which lives there.

**4. The handler side** (`current-user.decorator.ts`, `users.repository.ts`, `auth.service.ts`, `auth.controller.ts`, `health.controller.ts`)

`@CurrentUser()` is a parameter decorator. It reads the `userId` the guard put on the request and hands it to the handler as a plain, typed `string`:

```ts
@Get('me')
me(@CurrentUser() userId: string): Promise<User> {
  return this.auth.currentUser(userId);
}
```

If a route is marked `@Public()` and also uses `@CurrentUser()`, the decorator throws a plain `Error`, which becomes a `500`. That is a mistake in our code, not a user's mistake, so it must be loud, not a `401` that looks like the user's problem.

`GET /me` runs one more query, `SELECT … FROM users WHERE id = $1`, to return the full user. The guard does not load the user on every request, because almost no route needs more than the id. If the user does not exist, the service throws: `ON DELETE CASCADE` deletes a user's sessions with the user, so a live session without a user means the database is broken.

*Which routes are public?*

| Route | Why it is open |
|---|---|
| `POST /auth/register`, `POST /auth/login` | They are how you get a session |
| `POST /auth/logout` | A browser with an expired or stale cookie must still be able to log out and clear it. "Already logged out" is a success, not an error. The Linear issue listed only register, login and health; logout is added for this reason |
| `GET /health` | The hosting platform calls it without a login |

Everything else, now and in every later week, is closed.

**5. The tests** (`test/auth-me.e2e-spec.ts`)

`GET /me` is the first protected route, so its tests are also the tests of the guard.

| Rule | Test |
|---|---|
| A live cookie gives the user | `returns the logged-in user` |
| No cookie is refused | `answers 401 without a cookie` |
| A made-up token is refused | `answers 401 for a token that is not in the database` |
| Logout really ends the session | `answers 401 after logout` |
| An expired session is refused | `answers 401 when the session has expired` |
| Refusal is `401`, not `403` | `answers 401, not 403, so the client knows to show the login page` |

The register, login, logout and health tests send no cookie and still pass, which proves those routes are open.

**What this step leaves for later**

- The rate limit on register and login is step 4.
- A session is checked against the database on every request. That is one primary-key lookup, which is fine at this size. A cache can come much later, if ever.

### Check it

```bash
pnpm test:e2e
```

All 49 tests pass: 6 for `/auth/me` are new.

Try it for real, with `pnpm dev` running:

```bash
# 1. Without a cookie.
curl -i http://localhost:3001/api/auth/me
```

`401` with `Not logged in.`

```bash
# 2. Log in (saves the cookie), then ask who you are.
curl -s -c /tmp/cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"correct horse battery"}'

curl -i -b /tmp/cookies.txt http://localhost:3001/api/auth/me
```

`200` with your user.

```bash
# 3. Log out, then send the SAME cookie again.
curl -i -b /tmp/cookies.txt -X POST http://localhost:3001/api/auth/logout
curl -i -b /tmp/cookies.txt http://localhost:3001/api/auth/me
```

`204`, then `401`. The cookie file still holds the old token (`-b` only reads it), so this proves the session is gone from the database, not only from the browser.

---

## Step 4 — Rate limit on register and login

### Why

Checking a password takes about 0.1 second. That is slow for a guesser with a stolen database, but not for a guesser using the login form: one computer could try about ten passwords a second against one email, all day. The rate limit allows 5 requests a minute from one IP address. Thousands of guesses an hour become 300.

Register gets the same limit, so nobody can fill the database with accounts.

Only these two routes are limited. Every other route already needs a session cookie, so a limit there would only slow down real users.

This step closes week 2: the app now knows who the user is, protects every route, and protects the two routes that cannot be protected by a login.

### What we built

| File | Layer | Purpose |
|---|---|---|
| `package.json` | Dependency | New: `@nestjs/throttler` |
| `src/auth/auth.module.ts` | Module | The numbers: 5 per minute, and the error message |
| `src/auth/auth.controller.ts` | Controller | `@UseGuards(ThrottlerGuard)` on register and login |
| `src/config/app-config.ts` | Config | New: `trustProxy`, from `TRUST_PROXY` |
| `src/app.setup.ts` | App | Tells Express how many proxies to trust |
| `.env.example` | Config | Documents `TRUST_PROXY` |
| `src/config/app-config.spec.ts` | Test | 2 unit tests |
| `test/helpers/reset-rate-limit.ts` | Test helper | Clears the counters before each test |
| `test/auth-rate-limit.e2e-spec.ts` | Test | 5 e2e tests |
| `test/auth-*.e2e-spec.ts` | Test | Each calls `resetRateLimits` in `beforeEach` |

### How it works

**The answer after the 5th attempt in a minute**

```
429 Too Many Requests
Retry-After: 54
{ "statusCode": 429, "message": "Too many attempts. Try again in a minute." }
```

`Retry-After` says in how many seconds the next attempt is allowed. Every *allowed* answer from a limited route also carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`, so the frontend can show "2 attempts left" if we want.

**The path of a login from now on**

```
Request
   ↓
cookie-parser
   ↓
AuthGuard            login is @Public() → through
   ↓
ThrottlerGuard       key = this route + client IP
                     attempts in the last minute ≥ 5?      yes → 429
                     count this one
   ↓
ValidationPipe → AuthService.login → 200 or 401
```

A refused attempt is counted too. Five wrong passwords and then the right one gives `429`, not `200`. That is the point: the guesser does not get a 6th try, and neither does anyone else from that IP for the rest of the minute.

We built it in five small steps.

**1. The numbers, in one place** (`src/auth/auth.module.ts`)

```ts
ThrottlerModule.forRoot({
  throttlers: [{ ttl: minutes(1), limit: 5 }],
  errorMessage: 'Too many attempts. Try again in a minute.',
})
```

`ttl` is the window, `limit` the number of requests allowed inside it. Importing the module limits nothing by itself. It only provides the counter and the settings. A route is limited when it asks for the guard.

**2. The two routes** (`src/auth/auth.controller.ts`)

```ts
@Public()
@UseGuards(ThrottlerGuard)
@Post('login')
```

The guard is put on the two handlers, not on the whole app. The other way round, a global guard with `@SkipThrottle()` on every other route, has the wrong default for us: the two public routes are the ones under attack, and everything else is already behind a login.

**3. The client IP** (`src/config/app-config.ts`, `src/app.setup.ts`, `.env.example`)

The limit counts per IP, so the server must know the client's IP. On `localhost` it does. In production there is a proxy in front of the API: the hosting platform's load balancer, and later Next.js, which forwards `/api/*` to us. Then every connection comes from the proxy's IP, and all users would share **one** counter: the 6th user to log in within a minute would be locked out.

Proxies pass the real IP in the `X-Forwarded-For` header. Express reads it only when told how many proxies to trust: `app.set('trust proxy', 1)`. That number is the new `TRUST_PROXY` variable, default `0`.

Why not trust the header always? Because it is only a header. With no proxy in front, anyone could send `X-Forwarded-For: 1.2.3.4`, pick a new "IP" for every request, and the limit would count nothing. So trusting it is a decision made at deploy time, when we know how many proxies there are. Hosting is still open (`PROJECT.md`, section 12), so for now the variable is documented and off.

**4. Where the count lives**

The counters are a `Map` in the Node process, the default storage of `@nestjs/throttler`. Two consequences, both fine for now:

- A restart forgets the counts.
- If we ever run two copies of the API, each counts on its own, so the real limit is 10.

A shared store such as Redis fixes both. We add it when there is a second copy, not before.

**5. The tests** (`test/auth-rate-limit.e2e-spec.ts`, `test/helpers/reset-rate-limit.ts`)

Because the counters are in memory, they survive from one test to the next. The register tests alone register more than 5 accounts, so without a reset they would start getting `429`. `resetRateLimits(app)` empties the counters, and every auth test file calls it in `beforeEach`, the same way the database is emptied before every test.

| Rule | Test |
|---|---|
| 5 attempts pass, the 6th is refused with `429` and `Retry-After` | `allows 5 login attempts a minute and refuses the 6th with 429` |
| The right password does not help on the 6th try, and nothing is checked | `refuses the 6th attempt even when the password is correct` |
| Register has the same limit | `limits register the same way` |
| Each route has its own counter | `counts login and register separately` |
| Nothing else is limited | `does not limit other routes` |

**What this step leaves for later**

- The limit is per IP. A guesser with many IPs can try 5 a minute from each. A second limit per email, or a short lock after many failures, would help; not needed while the app is used by a few people.
- `TRUST_PROXY` must be set when we deploy. The deploy step owns it.

### Check it

```bash
pnpm test        # 10 unit tests
pnpm test:e2e    # 54 e2e tests
```

Try it for real, with `pnpm dev` running:

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "attempt $i: %{http_code}\n" \
    -X POST http://localhost:3001/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"you@example.com","password":"wrong password"}'
done
```

Attempts 1 to 5 answer `401`, attempt 6 answers `429`. Run attempt 6 with `-i` to see the `Retry-After` header. Wait a minute, and `401` comes back.
