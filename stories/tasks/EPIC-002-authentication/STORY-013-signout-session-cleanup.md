# STORY-013 — Sign-Out API and Expired Session Cleanup

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Provide a sign-out endpoint that deletes the user's active session from the database and clears the session cookie, and implement a cleanup service that periodically purges expired sessions to prevent database bloat. The cleanup job hooks into the existing `/api/cron/alerts` Cloud Scheduler endpoint (last step in the nightly pipeline, 8:30pm ET Mon-Fri) rather than requiring a new seventh scheduler entry.

## Story
As an authenticated user,
I want to sign out and have my session immediately invalidated,
so that my account is secure after I leave the application.

As the system operator,
I want expired sessions automatically purged from the database,
so that the `user_sessions` table does not grow unboundedly.

## Outcome
`POST /api/auth/signout` deletes the session row identified by the `sessionId` cookie, clears the cookie, and returns a 200 response. The client redirects to `/signin` after sign-out. A `cleanupExpiredSessions()` function in `src/modules/auth/cleanup.service.ts` issues `DELETE FROM user_sessions WHERE expires_at < NOW()`. This function is wired into the `/api/cron/alerts` endpoint (Mon-Fri, 8:30pm ET — the final step of the nightly pipeline) rather than a new Cloud Scheduler job. Cleanup runs after all nightly processing completes, which is the natural maintenance window.

## Scope In
- `POST /api/auth/signout` — delete session from `user_sessions`, clear `sessionId` cookie, return 200
- Graceful handling: if cookie is missing or sessionId not found in DB, still return 200 and clear cookie (idempotent sign-out)
- `cleanupExpiredSessions()` in `src/modules/auth/cleanup.service.ts`
- Wire `cleanupExpiredSessions()` into `/api/cron/alerts` (runs Mon-Fri 8:30pm ET; final step of nightly pipeline)
- Lazy cleanup in `validateSession()` (single expired row deleted on use) is implemented in STORY-012; this story adds the batch cleanup
- `AuthService.signOut(sessionId)` method (if not already implemented in STORY-011's AuthService scaffold)

## Scope Out
- Sign-out from all devices / session invalidation across all sessions for a user (V1: single-session sign-out only)
- Redirect handling server-side (client is responsible for redirect to /signin after 200 response)
- Session audit log or sign-out event table (V2)
- Configuring a new Cloud Scheduler job (existing 6 jobs are sufficient; see Key Risks)

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A (sign-out functionality, session cleanup)
- **ADRs:** ADR-011 (session deletion on sign-out, periodic cleanup via daily cron, HTTP-only cookie clear)
- **Upstream stories:**
  - STORY-011 (AuthService.signOut() scaffolded; session cookie set)
  - STORY-007 (6 Cloud Scheduler cron endpoints exist; one will host cleanup)

## Preconditions
- `user_sessions` table exists (STORY-004)
- `AuthService.signOut()` exists or is implemented here as part of the AuthService module
- At least one active cron endpoint slot is available for cleanup wiring

## Inputs
- `sessionId` cookie on the request
- (For cleanup cron) Cloud Scheduler OIDC token in `Authorization` header

## Outputs
- Sign-out: HTTP 200, `{ success: true }`, `Set-Cookie: sessionId=; HttpOnly; Max-Age=0; Path=/` (cookie cleared)
- Sign-out with missing cookie: HTTP 200, same cleared cookie (idempotent)
- Session cleanup: deleted row count logged, no body required beyond cron endpoint standard response
- `user_sessions` row deleted matching `sessionId` cookie value
- All rows with `expiresAt < NOW()` deleted by cleanup job

## Acceptance Criteria
- [ ] `POST /api/auth/signout` with valid session cookie returns 200 and deletes session from DB
- [ ] Session cookie is cleared in the response (Max-Age=0 or empty value)
- [ ] `POST /api/auth/signout` with no cookie or invalid sessionId still returns 200 (idempotent)
- [ ] After sign-out, the deleted sessionId is no longer valid (STORY-012 middleware rejects it)
- [ ] `cleanupExpiredSessions()` deletes all rows where `expiresAt < NOW()`
- [ ] Cleanup is invoked from an existing cron endpoint (not a new Cloud Scheduler job)
- [ ] Cleanup reports number of deleted rows in logs
- [ ] Cleanup is idempotent: running it when no expired sessions exist is a no-op with no error

## Test Strategy Expectations
- **Unit tests:**
  - `signOut(sessionId)`: Prisma delete called with correct sessionId; no throw if record not found
  - `cleanupExpiredSessions()`: Prisma deleteMany called with `expiresAt: { lt: new Date() }`; returns deleted count
  - Sign-out route: cookie cleared in response regardless of whether session existed
- **Integration tests:**
  - Full sign-out flow: create session → POST /api/auth/signout → 200 → row gone from user_sessions
  - Sign-out with already-deleted session: POST again → 200 (no error thrown)
  - Cleanup: insert 3 expired rows + 1 non-expired row → run cleanup → only non-expired row remains
  - Cleanup called from cron endpoint: POST /api/cron/<endpoint> with valid OIDC token → 200 → expired rows deleted
- **Contract/schema tests:**
  - Response body: `{ success: true }` (no session data)
  - Cookie cleared: response has `Set-Cookie: sessionId=; ...Max-Age=0...`
- **BDD acceptance tests:**
  - "Given an authenticated user, when POST /api/auth/signout, then session deleted and cookie cleared"
  - "Given a request with no session cookie, when POST /api/auth/signout, then 200 and no error"
  - "Given 5 expired session rows, when cleanup runs, then all 5 rows deleted"

## Regression / Invariant Risks
- **Sign-out idempotency:** If the endpoint throws on a missing session (e.g., Prisma throws P2025 record not found), a client with a stale cookie gets a 500 instead of a clean sign-out. Unit test must cover the missing-record case.
- **Cookie not cleared:** If the Set-Cookie header in the sign-out response omits `Max-Age=0` or uses a wrong path, the browser retains the stale cookie and the middleware may attempt to validate a deleted session on the next request. Contract tests must verify cookie attributes in sign-out response.
- **Cleanup overwrites lazy deletion:** Lazy cleanup in `validateSession()` and batch cleanup in `cleanupExpiredSessions()` both delete expired rows. They must not conflict; both must be idempotent (`deleteMany` with a filter is safe even if some rows were already deleted).

## Key Risks / Edge Cases
- **Cleanup runs Mon-Fri only:** All 6 Cloud Scheduler jobs are Mon-Fri. Session cleanup attached to `alerts` (8:30pm ET) will not run on weekends. Expired sessions may persist up to ~72 hours beyond expiry over a weekend. This is acceptable for V1: expired sessions pose no security risk (middleware rejects them on use via lazy cleanup), only database bloat. Weekend cleanup is a V2 enhancement if warranted.
- **Cleanup frequency:** Once-daily cleanup means expired sessions may persist up to 24 hours after expiry. This is acceptable per ADR-011. Lazy cleanup in `validateSession()` handles individual expired sessions immediately.
- **Cleanup running during high load:** `DELETE WHERE expiresAt < NOW()` on a large table can be slow. For V1 user counts (small), this is negligible. No batching needed in V1.
- **Sign-out from multiple tabs:** If a user has the app open in two tabs and signs out from one, the other tab's next request will hit middleware and be redirected (validateSession returns null). This is correct behavior.

## Definition of Done
- [ ] `POST /api/auth/signout` implemented in `src/app/api/auth/signout/route.ts`
- [ ] `cleanupExpiredSessions()` implemented in `src/modules/auth/cleanup.service.ts`
- [ ] Cleanup wired into appropriate existing cron endpoint
- [ ] Tests added and passing (unit, integration, contract)
- [ ] Traceability comments in source: ADR-011, PRD Section 9A
- [ ] Cleanup logs deleted row count (no PII in log output)

## Traceability
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (session deletion on sign-out, daily cleanup cron)
