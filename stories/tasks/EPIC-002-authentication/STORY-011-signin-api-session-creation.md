# STORY-011 — Sign-In API with Session Creation and Rate Limiting

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Authenticate a user by verifying their email and password, create a database-backed session, and return a secure HTTP-only session cookie. Enforce rate limiting to prevent brute-force attacks. This is the core authentication endpoint that all sign-in flows (UI and programmatic) will call.

## Story
As a registered user,
I want to submit my email and password to a sign-in endpoint,
so that I receive a session cookie and can access protected parts of the application.

## Outcome
A `POST /api/auth/signin` endpoint that validates credentials via bcrypt, creates a session row in `user_sessions`, sets an HTTP-only session cookie, and returns a success response. Invalid credentials return a generic error (no email enumeration). Inactive users are rejected. Requests that exceed 5 failed attempts per email within 15 minutes return 429. The `lastLoginAt` field on the user row is updated on each successful sign-in.

## Scope In
- `POST /api/auth/signin` — authenticate user, create session, set cookie
- bcrypt credential verification (compare submitted password against stored hash)
- Session creation: insert row into `user_sessions` with `expiresAt = now + 7 days`
- Update `lastLoginAt` on the `users` row after successful sign-in
- Session cookie: `sessionId`, HTTP-only, Secure (production only), SameSite=Lax, maxAge=7 days
- `isActive` flag checked: inactive users receive the same generic error as invalid credentials
- Generic error message: "Invalid email or password" (no distinction between wrong password and unknown email)
- Rate limiting: in-memory, 5 failed attempts per email per 15-minute window → 429
- Rate limit counter increments only on failed attempts; resets after window expires
- `AuthService` module: `src/modules/auth/auth.service.ts` — `signIn()`, `createUser()` (used by STORY-010), `validateSession()` (used by STORY-012), `signOut()` (used by STORY-013)
- In-memory rate limiter: `src/modules/auth/rate-limiter.ts`

## Scope Out
- Sliding window session renewal (ADR-011: fixed 7-day expiry, no sliding window)
- "Remember me" / variable session duration (Epic scope out; ADR-011: V2)
- Multi-instance rate limiting via Redis or DB (in-memory per ADR-011 for V1)
- IP-based rate limiting (email-based only per ADR-011)
- Password complexity beyond minimum length (STORY-010 scope)
- Session invalidation of prior sessions on new sign-in (multiple concurrent sessions allowed)

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A (email/password authentication, 7-day sessions, no social login)
- **RFCs:** RFC-002 (user_sessions table: session_id, user_id, expires_at, ip_address, user_agent, last_activity_at)
- **ADRs:** ADR-011 (bcrypt 10 rounds, session cookie attributes, in-memory rate limiting, no sliding window)
- **Upstream stories:** STORY-004 (user_sessions table migrated), STORY-010 (users table exists with password_hash; AuthService.createUser reused)

## Preconditions
- `users` and `user_sessions` tables exist in database (migrated in STORY-004)
- At least one active user record exists (created via STORY-010 endpoint) for integration test setup
- `bcrypt` package available in runtime

## Inputs
- Request body: `{ email: string, password: string }`
- `x-forwarded-for` / `user-agent` headers (stored on session row; optional, not used for auth logic)

## Outputs
- On success: HTTP 200, `{ userId, email }`, `Set-Cookie: sessionId=<uuid>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Path=/`
- On invalid credentials or inactive user: HTTP 401, `{ error: "Invalid email or password" }`
- On rate limit exceeded: HTTP 429, `{ error: "Too many sign-in attempts. Please try again later." }`
- On invalid body: HTTP 400, `{ error: "Email and password are required" }`
- Session row inserted: `user_sessions(sessionId, userId, expiresAt, createdAt, lastActivityAt)`
- User row updated: `users.lastLoginAt = now()`

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
- **Unit tests:**
  - `signIn()` with valid credentials: bcrypt.compare called, session created, lastLoginAt updated
  - `signIn()` with wrong password: bcrypt.compare returns false, null returned, no session insert
  - `signIn()` with inactive user: null returned before bcrypt.compare (or after — either is correct)
  - `signIn()` with unknown email: null returned, same timing as wrong-password path (constant-time)
  - Rate limiter: 5 calls within window → 6th blocked; counter resets after window; different emails independent
  - Cookie attributes serialized correctly (httpOnly, secure, sameSite, maxAge)
- **Integration tests:**
  - Full sign-in flow: POST → 200 → session row in DB → cookie in response
  - Invalid password: POST → 401 → zero rows in user_sessions
  - Inactive user: POST → 401 → zero rows in user_sessions
  - Duplicate sign-ins: two successful POSTs → two rows in user_sessions (multiple sessions allowed)
  - Rate limit integration: 5 failed POSTs → 6th returns 429
- **Contract/schema tests:**
  - Success response body: `{ userId: string, email: string }` — no passwordHash, no password
  - Error response body: `{ error: string }` only
  - Cookie header present with correct attributes on 200 response
- **BDD acceptance tests:**
  - "Given valid credentials, when POST /api/auth/signin, then 200 and sessionId cookie set"
  - "Given wrong password, when POST /api/auth/signin, then 401 and no cookie"
  - "Given inactive user, when POST /api/auth/signin, then 401 and no cookie"
  - "Given 5 failed attempts in 15 min, when 6th attempt, then 429"

## Regression / Invariant Risks
- **Email enumeration:** "Email not found" vs "Wrong password" would expose whether an email is registered. Contract tests must verify the identical `{ error: "Invalid email or password" }` response for both cases.
- **Raw password in response:** If session creation or user update accidentally serializes the request body, raw password could leak. Contract tests on response shape prevent this.
- **Rate limit bypass:** If counter is keyed incorrectly (e.g., on userId instead of email), pre-sign-in enumeration attempts don't count. Unit test must verify counter increments before DB lookup completes.
- **isActive not checked:** A disabled user could sign in if the isActive check is removed. Integration test with `isActive=false` user must be maintained.

## Key Risks / Edge Cases
- **In-memory rate limiter loses state on Cloud Run instance restart or scale-out:** Each instance has its own counter. An attacker with multiple Cloud Run instances could attempt 5×N attempts. Acceptable for V1 per ADR-011 (small user base, admin-controlled accounts).
- **bcrypt timing:** bcrypt.compare on a valid hash takes ~100ms regardless. For unknown emails, the user lookup returns null before bcrypt runs — response is faster, enabling timing-based email enumeration. Mitigation: always run bcrypt.compare against a dummy hash for unknown emails (constant-time).
- **Concurrent sign-in race:** Two simultaneous requests with valid credentials will both create sessions. This is acceptable (multiple sessions allowed).
- **`lastActivityAt` on UserSession schema:** The Prisma schema includes `lastActivityAt` on `user_sessions`. ADR-011 explicitly specifies no sliding window. Set `lastActivityAt = createdAt` at creation time and do not update it subsequently. See Section D boundary question 1.

## Definition of Done
- [ ] `POST /api/auth/signin` implemented in `src/app/api/auth/signin/route.ts`
- [ ] `AuthService` created at `src/modules/auth/auth.service.ts` (signIn, validateSession, signOut, createUser)
- [ ] In-memory rate limiter at `src/modules/auth/rate-limiter.ts`
- [ ] Tests added and passing (unit, integration, contract)
- [ ] Traceability comments in source: ADR-011, PRD Section 9A
- [ ] No password or hash logged or returned in any response or log line
- [ ] Logging: sign-in success (userId, email, timestamp) and failure (email, reason category, timestamp) — no password

## Traceability
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A
- **RFC:** /docs/rfc/RFC-002-canonical-data-model-persistence.md (user_sessions schema)
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (bcrypt, session cookies, rate limiting, no sliding window)
