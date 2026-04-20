# STORY-011 — Sign-In API with Session Creation and Rate Limiting

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Authenticate a user by verifying their email and password, create a database-backed session, and return a secure HTTP-only session cookie. Enforce rate limiting to prevent brute-force attacks. This is the core authentication endpoint that all sign-in flows call.

## Story
As a **registered user**,
I want **to submit my email and password to a sign-in endpoint and receive a session cookie**,
so that **I can access protected parts of the application**.

## Outcome
- `POST /api/auth/signin` endpoint validates credentials via bcrypt.compare
- On success: inserts session row into `user_sessions` (expiresAt = now + 7 days), sets HTTP-only session cookie, returns 200 with `{ userId, email }`
- On failure: returns 401 with generic message "Invalid email or password" (no email enumeration)
- Inactive users (`isActive=false`) receive the same generic 401 (no distinction from wrong password)
- Rate limiting enforced: 5 failed attempts per email per 15-minute window → 429
- `lastLoginAt` updated on the `users` row after each successful sign-in
- `AuthService` module established at `src/modules/auth/auth.service.ts` (reused by STORY-012 and STORY-013)

## Scope In
- `POST /api/auth/signin` route at `src/app/api/auth/signin/route.ts`
- bcrypt credential verification (compare submitted password against stored hash)
- Session creation: insert into `user_sessions` with `expiresAt = now + 7 days`, `lastActivityAt = createdAt`
- Update `lastLoginAt` on the `users` row after successful sign-in
- Session cookie: name `sessionId`, HttpOnly, Secure (production only), SameSite=Lax, maxAge=604800 (7 days), Path=/
- `isActive` flag checked: inactive users receive the same generic error as invalid credentials
- Generic error: "Invalid email or password" for all failure cases (wrong password, unknown email, inactive user)
- Rate limiting: in-memory, per-email, 5 failed attempts per 15-minute window → 429
- Rate limit counter increments only on failed attempts; resets after window expires
- `AuthService` at `src/modules/auth/auth.service.ts`: `signIn()`, `validateSession()` (STORY-012), `signOut()` (STORY-013)
- In-memory rate limiter at `src/modules/auth/rate-limiter.ts`

## Scope Out
- Sliding window session renewal (ADR-011: fixed 7-day expiry; `lastActivityAt` set at creation, never updated)
- "Remember me" / variable session duration (ADR-011: V2; not in V1 scope)
- Multi-instance rate limiting via Redis or DB (in-memory per ADR-011; acceptable for V1 small user base)
- IP-based rate limiting (email-based only per ADR-011)
- Session invalidation of prior sessions on new sign-in (multiple concurrent sessions allowed)

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A (email/password authentication, 7-day sessions, no social login)
- **RFCs:** RFC-002 (user_sessions table: session_id, user_id, expires_at, last_activity_at)
- **ADRs:** ADR-011 (bcrypt 10 rounds, session cookie attributes, in-memory rate limiting, no sliding window)
- **Upstream stories:** STORY-004 (user_sessions table migrated), STORY-010 (users table exists with password_hash; AuthService.createUser reused)

## Preconditions
- `users` and `user_sessions` tables exist in database (migrated in STORY-004)
- At least one active user record exists (created via STORY-010) for integration test setup
- `bcrypt` package available in runtime

## Inputs
- Request body: `{ email: string, password: string }`
- `x-forwarded-for` / `user-agent` headers (stored on session row; not used for auth logic)

## Outputs
- On success: HTTP 200, `{ userId, email }`, `Set-Cookie: sessionId=<uuid>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/`
- On invalid credentials or inactive user: HTTP 401, `{ error: "Invalid email or password" }`
- On rate limit exceeded: HTTP 429, `{ error: "Too many sign-in attempts. Please try again later." }`
- On invalid body: HTTP 400, `{ error: "Email and password are required" }`
- Session row inserted in `user_sessions`
- `users.lastLoginAt` updated

## Acceptance Criteria
- [ ] `POST /api/auth/signin` with valid credentials returns 200 and sets sessionId cookie
- [ ] Successful sign-in inserts a row in `user_sessions` with `expiresAt` = now + 7 days
- [ ] `users.lastLoginAt` is updated on successful sign-in
- [ ] Wrong password returns 401 with "Invalid email or password" (no session created)
- [ ] Unknown email returns 401 with "Invalid email or password" (identical response — no enumeration)
- [ ] Inactive user (`isActive=false`) returns 401 with same generic error (no session created)
- [ ] Cookie attributes: HttpOnly, Secure (production), SameSite=Lax, Max-Age=604800, Path=/
- [ ] 5 failed attempts within 15 min → 6th attempt returns 429 without querying the DB
- [ ] Rate limit counter is per-email and resets after 15-minute window expires
- [ ] Missing email or password returns 400

## Test Strategy Expectations

**Unit tests:**
- `signIn()` with valid credentials: bcrypt.compare called, session created, lastLoginAt updated
- `signIn()` with wrong password: bcrypt.compare returns false, null returned, no session insert
- `signIn()` with inactive user: null returned, same 401 path as wrong password
- `signIn()` with unknown email: null returned; bcrypt.compare run against dummy hash (constant-time protection)
- Rate limiter: 5 calls within window → 6th blocked; counter resets after window; different emails are independent
- Cookie attributes serialized correctly (httpOnly, secure, sameSite, maxAge)

**Integration tests:**
- Full sign-in flow: POST → 200 → session row in DB → cookie in response headers
- Invalid password: POST → 401 → zero rows in user_sessions
- Inactive user: POST → 401 → zero rows in user_sessions
- Duplicate sign-ins: two successful POSTs → two rows in user_sessions (multiple sessions allowed)
- Rate limit: 5 failed POSTs → 6th returns 429

**Contract/schema tests:**
- Success response: `{ userId: string, email: string }` — no passwordHash, no password
- Error response: `{ error: string }` only
- Cookie header present with correct attributes on 200 response

**BDD acceptance tests:**
- "Given valid credentials, when POST /api/auth/signin, then 200 and sessionId cookie set"
- "Given wrong password, when POST /api/auth/signin, then 401 and no cookie"
- "Given inactive user, when POST /api/auth/signin, then 401 and no cookie"
- "Given 5 failed attempts in 15 min, when 6th attempt, then 429"

**E2E tests:** Covered by STORY-014 (sign-in page submits to this endpoint)

## Regression / Invariant Risks

**Email enumeration:**
- Risk: Different error messages for "email not found" vs "wrong password" expose whether an email is registered
- Protection: Contract tests verify identical `{ error: "Invalid email or password" }` for both failure cases

**Raw password in response:**
- Risk: Session creation or user update accidentally serialises the request body, leaking the raw password
- Protection: Contract tests on response shape verify no password field present

**Rate limit bypass:**
- Risk: Counter keyed incorrectly (e.g., on userId instead of email), allowing unlimited pre-sign-in attempts
- Protection: Unit test verifies counter increments before any DB lookup completes

**isActive not checked:**
- Risk: A disabled user signs in if the isActive check is removed
- Protection: Integration test with `isActive=false` user must be maintained in test suite

**Timing attack on unknown emails:**
- Risk: Unknown email path returns faster (no bcrypt), enabling timing-based enumeration
- Protection: Always run bcrypt.compare against a dummy hash for unknown emails

**Invariants to protect:**
- Generic error message used for all failure cases (wrong password, unknown email, inactive user)
- Session cookie always HttpOnly, Secure (production), SameSite=Lax
- Rate limit applied before any DB query on failed attempts
- No password or hash ever included in any response body or log line

## Key Risks / Edge Cases

**In-memory rate limiter across Cloud Run instances:**
- Each instance has independent state; an attacker could attempt 5×N per window across N instances
- Acceptable for V1 per ADR-011 (small, admin-controlled user base)

**bcrypt timing:**
- bcrypt.compare takes ~100ms; unknown email path skips it, enabling timing enumeration
- Mitigation: run bcrypt.compare against a dummy hash for unknown-email path (constant-time)

**Concurrent sign-in race:**
- Two simultaneous valid requests will both create sessions (multiple sessions allowed; acceptable)

**`lastActivityAt` on session schema:**
- Prisma schema includes `lastActivityAt` on user_sessions; ADR-011 says no sliding window
- Set `lastActivityAt = createdAt` at session creation; never update it during middleware passes

## Definition of Done

- [ ] `POST /api/auth/signin` implemented at `src/app/api/auth/signin/route.ts`
- [ ] `AuthService` created at `src/modules/auth/auth.service.ts` (signIn, validateSession, signOut)
- [ ] In-memory rate limiter at `src/modules/auth/rate-limiter.ts`
- [ ] Tests added and passing (unit, integration, contract)
- [ ] Traceability comments in source: ADR-011, PRD Section 9A
- [ ] No password or hash logged or returned in any response or log line
- [ ] Logging: sign-in success (userId, email, timestamp) and failure (email, reason category, timestamp)

## Traceability

- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A
- **RFC:** /docs/rfc/RFC-002-canonical-data-model-persistence.md (user_sessions schema)
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (bcrypt, session cookies, rate limiting, no sliding window)

---

**END STORY-011**
