# STORY-012 — Session Validation Middleware and Route Protection

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Protect all application routes behind authentication by implementing Next.js middleware that reads the `sessionId` cookie, validates the session against the database, and either forwards the request with user context injected into headers or redirects unauthenticated users to `/signin`.

## Story
As **the application**,
I want **middleware to validate every incoming request against the active session store**,
so that **unauthenticated users are redirected to sign-in and authenticated users have their identity available to all server-side code**.

## Outcome
- `src/middleware.ts` intercepts all requests matching protected routes
- Valid sessions: request proceeds with `x-user-id` and `x-user-email` injected into request headers
- Invalid or expired sessions: `sessionId` cookie cleared, redirect to `/signin`
- Expired session rows deleted from `user_sessions` during validation (lazy cleanup)
- Already-authenticated users visiting `/signin` redirected to `/`
- `getCurrentUser()` helper at `src/lib/auth.ts` reads injected headers from Server Components and API routes
- Matcher explicitly excludes routes with their own auth: `/signin`, `/api/health`, `/api/cron/*`, `/api/admin/*`

## Scope In
- `src/middleware.ts` — Next.js middleware (Node.js runtime required; see Key Risks)
- Reads `sessionId` cookie from request
- Calls `AuthService.validateSession(sessionId)` — queries `user_sessions`, checks `expiresAt`, checks `user.isActive`
- Valid session: forwards request with `x-user-id` and `x-user-email` headers added
- Missing cookie or invalid/expired session: deletes `sessionId` cookie, redirects to `/signin`
- Expired session row: deleted from `user_sessions` during `validateSession()` (lazy cleanup)
- Already-authenticated users visiting `/signin`: redirected to `/`
- `src/lib/auth.ts` — `getCurrentUser()` reads `x-user-id` / `x-user-email` from `headers()` in Server Components
- Matcher excludes: `/signin`, `/api/health`, `/api/cron/*`, `/api/admin/*`, `/_next/*`, `/favicon.ico`

## Scope Out
- Sliding window session renewal on each request (ADR-011: no sliding window; `lastActivityAt` not updated by middleware)
- Role-based access control (all users have same access for V1, ADR-007)
- IP address validation or device fingerprinting (V2)
- Custom per-route authorization beyond authenticated/unauthenticated
- CSRF token validation (SameSite=Lax cookie covers CSRF for V1 per ADR-011)

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A (route protection, session validation, redirect unauthenticated to sign-in)
- **ADRs:** ADR-011 (session cookie attributes, no sliding window, middleware pattern), ADR-007 (user isolation via x-user-id header injection)
- **Upstream stories:** STORY-011 (AuthService.validateSession() implemented; session cookies being set)

## Preconditions
- `AuthService.validateSession()` exists and returns `User | null`
- `user_sessions` table exists with `expiresAt` and `userId` columns
- `src/middleware.ts` does not yet exist

## Inputs
- Incoming HTTP request (all routes matching middleware config)
- `sessionId` cookie value

## Outputs
- Authenticated request: forwarded with `x-user-id` and `x-user-email` headers set
- Unauthenticated request: `302 Redirect` to `/signin`, `sessionId` cookie cleared
- Authenticated user visiting `/signin`: `302 Redirect` to `/`
- `getCurrentUser()`: returns `{ userId: string, email: string }` or `null`

## Acceptance Criteria
- [ ] Valid session → request proceeds with `x-user-id` and `x-user-email` in headers
- [ ] No sessionId cookie → redirect to `/signin`; no `x-user-id` header set
- [ ] Invalid session (not in DB) → redirect to `/signin`, cookie cleared
- [ ] Expired session → redirect to `/signin`, cookie cleared, expired row deleted from DB
- [ ] Inactive user session → redirect to `/signin` (validateSession returns null for inactive users)
- [ ] `/signin` bypasses middleware (no redirect loop for unauthenticated access)
- [ ] `/api/health` bypasses middleware (health check remains unauthenticated)
- [ ] `/api/cron/*` bypasses middleware (cron endpoints use OIDC auth, not session cookies)
- [ ] `/api/admin/*` bypasses middleware (admin endpoints use API key auth, not session cookies)
- [ ] Authenticated user visiting `/signin` redirected to `/`
- [ ] `getCurrentUser()` returns correct user from headers when middleware has run; returns null otherwise

## Test Strategy Expectations

**Unit tests:**
- Middleware with valid sessionId cookie: validateSession called, headers forwarded, no redirect
- Middleware with no cookie: redirect to /signin, no DB call
- Middleware with invalid sessionId: validateSession returns null, redirect to /signin, cookie cleared
- Middleware with expired session: redirect, cookie cleared
- Middleware on `/signin`: next() called without validateSession call
- Middleware on `/api/health`: next() called without validateSession call
- Middleware on `/api/cron/price-sync`: next() called without validateSession call
- Middleware on `/api/admin/users`: next() called without validateSession call
- Authenticated user on `/signin`: redirect to `/`
- `getCurrentUser()`: valid headers → `{ userId, email }`; missing headers → null

**Integration tests:**
- Request to protected route with valid session cookie → 200 (not redirected)
- Request to protected route without cookie → 302 to /signin
- Request to protected route with expired session → 302 to /signin, row deleted from DB
- `/api/health` request without cookie → 200 (bypasses middleware)
- `/api/admin/users` request without cookie but with valid API key → proceeds (bypasses session middleware)

**Contract/schema tests:**
- `x-user-id` header is a valid UUID when session is valid
- `x-user-email` header matches the users.email for the session owner
- Redirect response has `Location: /signin` header

**BDD acceptance tests:**
- "Given a valid session cookie, when accessing a protected route, then request proceeds"
- "Given no session cookie, when accessing a protected route, then redirected to /signin"
- "Given an expired session, when accessing a protected route, then redirected to /signin"
- "Given an authenticated user visiting /signin, then redirected to /"

**E2E tests:** Covered by STORY-014 (full sign-in flow exercises middleware)

## Regression / Invariant Risks

**Cron endpoint auth bypass broken:**
- Risk: `/api/cron/*` accidentally included in session matcher; OIDC-protected cron jobs fail (no session cookie)
- Protection: Unit test verifies each of the 6 cron routes bypasses session validation

**Admin endpoint auth bypass broken:**
- Risk: `/api/admin/*` included in matcher; requests authenticated via `x-api-key` incorrectly rejected
- Protection: Integration test verifies admin endpoint reachable with API key but no session cookie

**x-user-id spoofing:**
- Risk: Attacker sets `x-user-id` header in request before middleware runs, downstream code trusts it
- Protection: Middleware overwrites (not appends) the header value; client-supplied values replaced

**Inactive user session survives:**
- Risk: validateSession only checks `expiresAt` and not `isActive`; disabled user continues using app
- Protection: Integration test with `isActive=false` user after session creation must be maintained

**Invariants to protect:**
- No request reaches a protected route handler without `x-user-id` set by middleware
- `lastActivityAt` is never updated by middleware (no sliding window per ADR-011)
- Expired session rows deleted on access (lazy cleanup)
- Middleware never logs full session cookie value or user PII beyond userId

## Key Risks / Edge Cases

**Next.js middleware Edge runtime vs Node.js runtime:**
- Middleware runs on Edge runtime by default; Prisma requires Node.js runtime
- Mitigation: add `export const runtime = 'nodejs'` to middleware.ts; verify Cloud Run compatibility

**Middleware matcher syntax:**
- `/api/cron/:path*` must correctly match all 6 cron routes; test each explicitly
- Incorrect negative lookahead syntax can silently include or exclude unintended routes

**Redirect loop:**
- If `/signin` not excluded from matcher and session validation fails, infinite redirect loop occurs
- Exclusion of `/signin` from matcher is a critical correctness requirement

**`lastActivityAt` field on session schema:**
- Schema has the column; ADR-011 says no sliding window
- Middleware must NOT issue a DB update on each request (would create N DB writes per page load)

## Definition of Done

- [ ] `src/middleware.ts` implemented with correct matcher config
- [ ] `src/lib/auth.ts` with `getCurrentUser()` implemented
- [ ] Tests added and passing (unit, integration)
- [ ] All 6 cron routes verified as excluded from session middleware in tests
- [ ] Traceability comments in source: ADR-011, ADR-007, PRD Section 9A
- [ ] No session cookie value or user PII logged by middleware (userId only for audit logging)

## Traceability

- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (middleware pattern, session validation)
- **ADR:** /docs/adr/ADR-007-multi-user-architecture-shared-vs-user-state.md (x-user-id header injection for user isolation)

---

**END STORY-012**
