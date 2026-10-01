# Week 2 — Auth

This week the app learns who is using it. Every table of user data has `user_id`, so no feature can be built or tested until there is a user.

| # | Step | Linear | Status |
|---|---|---|---|
| 1 | [Register](#step-1--register) | YOU-13 | Done |
| 2 | [Login + logout](#step-2--login-and-logout) | YOU-14 | Done |
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
| `src/auth/auth-sessions.repository.ts` | Repository | New: delete a session |
| `src/auth/auth.service.ts` | Service | New: `login`, `logout`, the dummy hash |
| `src/auth/auth.controller.ts` | Controller | New: the two routes |
| `test/helpers/session-cookie.ts` | Test helper | Reads the cookie from a response |
| `test/auth-login.e2e-spec.ts` | Test | 11 e2e tests |
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
                     4. save a new login session
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

*No transaction.* Register writes two rows, so it needs one. Login writes one row, and one `INSERT` is already all-or-nothing.

*Login answers 200, logout 204.* NestJS answers `201 Created` to a `POST` by default. Login does not create something the client asked for, so it answers `200`. Logout has nothing to return, so it answers `204`.

*Logout never fails.* With no cookie, or a token that is not in the database, the user is already logged out. That is the result they asked for, so the answer is still `204`, and the cookie is cleared in every case.

**5. The tests** (`test/auth-login.e2e-spec.ts`, `test/auth-logout.e2e-spec.ts`)

Each rule above has a test, so a later change cannot break it without a test failing.

| Rule | Test |
|---|---|
| The hash never leaves the server | `returns the user without the password` |
| A new token for every login | `creates a new session and stores only a hash of its token` |
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
- A new login does not end older sessions of the same user. They end at logout or after 30 days.

### Check it

```bash
pnpm test:e2e
```

All 42 tests pass: 11 for login and 5 for logout are new.

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
