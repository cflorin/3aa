# STORY-012 — Session Validation Middleware and Route Protection

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Protect all application routes behind authentication by implementing Next.js middleware that reads the `sessionId` cookie, validates the session against the database, and either forwards the request with user context injected into headers or redirects to `/signin`. Provide a `getCurrentUser()` helper for Server Components to read the forwarded user identity.

## Story
As the application,
I want middleware to validate every incoming request against the active session store,
so that unauthenticated users are redirected to sign-in and authenticated users have their identity available to all server-side code.

## Outcome
`src/middleware.ts` intercepts all requests matching protected routes. Valid sessions allow the request to proceed with `x-user-id` and `x-user-email` injected into request headers. Invalid or expired sessions clear the cookie and redirect to `/signin`. A `getCurrentUser()` helper in `src/lib/auth.ts` reads the injected headers from Server Components and API routes. The matcher explicitly excludes routes that have their own authentication: `/signin`, `/api/health`, `/api/cron/*`, and `/api/admin/*`.

## Scope In
- `src/middleware.ts` — Next.js edge-compatible middleware
- Reads `sessionId` cookie from request
- Calls `AuthService.validateSession(sessionId)` — queries `user_sessions`, checks `expiresAt`, checks `user.isActive`
- Valid session: forwards request with `x-user-id` and `x-user-email` headers added
- Missing cookie or invalid session: deletes `sessionId` cookie and redirects to `/signin`
- Expired session row: deleted from `user_sessions` during `validateSession()` (lazy cleanup)
- Matcher excludes from middleware: `/signin`, `/api/health`, `/api/cron/*`, `/api/admin/*`, `/_next/*`, `/favicon.ico`
- `src/lib/auth.ts` — `getCurrentUser()` reads `x-user-id` / `x-user-email` from `headers()` in Server Components
- Already-authenticated users visiting `/signin` are redirected to `/` (prevent re-login loop)

## Scope Out
- Sliding window session renewal on each request (ADR-011: no sliding window; `lastActivityAt` is not updated by middleware)
- Role-based access control (all users have same access for V1, ADR-007)
- IP address validation or device fingerprinting (V2)
- Custom per-route authorization (beyond authenticated/unauthenticated)
- CSRF token validation (SameSite=Lax cookie covers CSRF for V1 per ADR-011)

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A (route protection, session validation, redirect unauthenticated to sign-in)
- **ADRs:** ADR-011 (session cookie attributes, no sliding window, middleware pattern), ADR-007 (user isolation via x-user-id header injection)
- **Upstream stories:** STORY-011 (AuthService.validateSession() implemented; session cookies being set)

## Preconditions
- `AuthService.validateSession()` exists and returns `User | null`
- `user_sessions` table exists with `expiresAt` and `userId` columns
- `src/middleware.ts` does not yet exist (new file)

## Inputs
- Incoming HTTP request (all routes matching the middleware config)
- `sessionId` cookie value

## Outputs
- Authenticated request: forwarded with `x-user-id` and `x-user-email` headers set
- Unauthenticated request: `302 Redirect` to `/signin`, `sessionId` cookie cleared
- Authenticated user visiting `/signin`: `302 Redirect` to `/`
- `getCurrentUser()`: returns `{ userId: string, email: string }` or `null`

## Acceptance Criteria
- [ ] Valid session → request proceeds with `x-user-id` and `x-user-email` in headers
- [ ] No sessionId cookie → redirect to `/signin`, no `x-user-id` header set
- [ ] Invalid session (not in DB) → redirect to `/signin`, cookie cleared
- [ ] Expired session → redirect to `/signin`, cookie cleared, expired row deleted from DB
- [ ] Inactive user session → redirect to `/signin` (validateSession returns null for inactive users)
- [ ] `/signin` route bypasses middleware (no redirect loop for unauthenticated access)
- [ ] `/api/health` bypasses middleware (health check remains unauthenticated)
- [ ] `/api/cron/*` bypasses middleware (cron endpoints use OIDC auth, not session cookies)
- [ ] `/api/admin/*` bypasses middleware (admin endpoints use API key auth, not session cookies)
- [ ] Authenticated user visiting `/signin` redirected to `/`
- [ ] `getCurrentUser()` returns correct user from headers when middleware has run; returns null otherwise

## Test Strategy Expectations
- **Unit tests:**
  - Middleware with valid sessionId cookie: validateSession called, headers forwarded, no redirect
  - Middleware with no cookie: redirect to /signin, no DB call
  - Middleware with invalid sessionId: validateSession returns null, redirect to /signin, cookie cleared
  - Middleware with expired session: redirect, cookie cleared
  - Middleware on `/signin` path: next() called without validateSession call
  - Middleware on `/api/health`: next() called without validateSession call
  - Middleware on `/api/cron/daily-price-fetch`: next() called without validateSession call
  - Middleware on `/api/admin/users`: next() called without validateSession call
  - Authenticated user on `/signin`: redirect to `/`
  - `getCurrentUser()`: valid headers → returns `{ userId, email }`; missing headers → null
- **Integration tests:**
  - Request to protected route with valid session cookie → 200 (not redirected)
  - Request to protected route without cookie → 302 to /signin
  - Request to protected route with expired session → 302 to /signin, row deleted from DB
  - `/api/health` request without cookie → 200 (bypasses middleware)
  - `/api/admin/users` request without cookie but with valid API key → 201 (bypasses session middleware)
- **Contract/schema tests:**
  - x-user-id header is a valid UUID when session is valid
  - x-user-email header matches the users.email for the session owner
  - Redirect response has `Location: /signin` header
- **BDD acceptance tests:**
  - "Given an authenticated session cookie, when accessing /universe, then request proceeds"
  - "Given no session cookie, when accessing /universe, then redirected to /signin"
  - "Given an expired session, when accessing /universe, then redirected to /signin"
  - "Given an authenticated user visiting /signin, then redirected to /"

## Regression / Invariant Risks
- **Cron endpoint auth bypass:** If `/api/cron/*` is accidentally included in the session-cookie matcher, the OIDC-protected cron jobs will break (they don't send a sessionId cookie). Matcher exclusion must be tested explicitly.
- **Admin endpoint auth bypass:** If `/api/admin/*` is included in the session middleware matcher, requests authenticated via `x-api-key` will be incorrectly rejected (no session cookie). Matcher exclusion must be tested explicitly.
- **User identity injection:** If `x-user-id` can be spoofed by a client by setting the header directly before middleware runs, downstream code may trust an attacker-controlled identity. Next.js middleware must overwrite (not append) the header value, and the header must not be forwarded from untrusted client requests.
- **Inactive user session survives restart:** If `validateSession()` only checks `expiresAt` and not `isActive`, a user disabled after sign-in could continue using the app. Integration test with `isActive=false` after session creation must be maintained.

## Key Risks / Edge Cases
- **Next.js middleware runs on the Edge runtime by default:** `AuthService.validateSession()` uses Prisma (Node.js runtime). Middleware must either run in Node.js runtime (via `export const runtime = 'nodejs'`) or use a lightweight HTTP-based session lookup. This is an architectural constraint to resolve during implementation.
- **Middleware matcher syntax:** Next.js matcher uses path patterns. `/api/cron/:path*` must correctly match all 6 cron routes. Test all 6 explicitly.
- **Redirect loop:** If `/signin` is not excluded from matcher and session validation fails, a redirect to `/signin` would be intercepted again, causing an infinite loop. Exclusion of `/signin` from matcher is critical.
- **`lastActivityAt` field:** Schema has `lastActivityAt` on sessions. ADR-011 says no sliding window. Middleware must NOT update `lastActivityAt` on each request (would create N DB writes per page load). See Section D boundary question 1.

## Definition of Done
- [ ] `src/middleware.ts` implemented with correct matcher config
- [ ] `src/lib/auth.ts` with `getCurrentUser()` implemented
- [ ] Tests added and passing (unit, integration)
- [ ] Matcher exclusions verified: `/signin`, `/api/health`, `/api/cron/*`, `/api/admin/*`
- [ ] Traceability comments in source: ADR-011, ADR-007, PRD Section 9A
- [ ] No session data or user PII logged by middleware (only userId for audit)

## Traceability
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (middleware pattern, session validation, cookie attributes)
- **ADR:** /docs/adr/ADR-007-multi-user-architecture-shared-vs-user-state.md (x-user-id header injection for user isolation)
