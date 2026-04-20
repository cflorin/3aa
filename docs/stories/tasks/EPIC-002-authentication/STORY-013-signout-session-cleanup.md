# STORY-013 — Sign-Out API and Expired Session Cleanup

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Provide a sign-out endpoint that immediately invalidates the user's session and clears the session cookie, and implement a batch cleanup service that purges expired sessions from the database nightly via the existing `/api/cron/alerts` Cloud Scheduler endpoint.

## Story
As an **authenticated user**,
I want **to sign out and have my session immediately invalidated**,
so that **my account is secure after I leave the application**.

As a **system operator**,
I want **expired sessions automatically purged from the database nightly**,
so that **the `user_sessions` table does not grow unboundedly**.

## Outcome
- `POST /api/auth/signout` deletes the session row identified by the `sessionId` cookie, clears the cookie, and returns 200
- Sign-out is idempotent: missing cookie or unknown sessionId still returns 200 with cleared cookie
- `cleanupExpiredSessions()` in `src/modules/auth/cleanup.service.ts` issues `DELETE FROM user_sessions WHERE expires_at < NOW()`
- Cleanup wired into `/api/cron/alerts` (Mon-Fri, 8:30pm ET — final step of nightly pipeline)
- Weekend gap is acceptable: expired sessions are rejected by middleware lazy cleanup regardless of batch state

## Scope In
- `POST /api/auth/signout` at `src/app/api/auth/signout/route.ts` — delete session, clear cookie, return 200
- Graceful handling: missing cookie or sessionId not found in DB → still return 200, still clear cookie
- `AuthService.signOut(sessionId)` at `src/modules/auth/auth.service.ts` (adds to the module from STORY-011)
- `cleanupExpiredSessions()` at `src/modules/auth/cleanup.service.ts`
- Wire `cleanupExpiredSessions()` into `/api/cron/alerts/route.ts` (OIDC-protected, existing endpoint)
- Lazy cleanup (single expired row deleted during `validateSession()`) is in STORY-012; this story adds the batch path

## Scope Out
- Sign-out from all devices (V1: single-session sign-out only; the sessionId in the cookie is deleted)
- Redirect handling server-side (client responsible for redirect to /signin after 200 response)
- Session audit log or sign-out event table (V2)
- New Cloud Scheduler job (all 6 existing slots are Mon-Fri; cleanup added to alerts slot)
- Weekend cleanup scheduling (V2 enhancement if session table growth warrants it)

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A (sign-out functionality, session cleanup)
- **ADRs:** ADR-011 (session deletion on sign-out, periodic cleanup via daily cron)
- **Upstream stories:**
  - STORY-011 (AuthService module established; session cookie set; signOut() scaffolded)
  - STORY-007 (6 Cloud Scheduler cron endpoints exist; alerts endpoint hosts cleanup)

## Preconditions
- `user_sessions` table exists (STORY-004)
- `AuthService` module exists (STORY-011)
- `/api/cron/alerts` endpoint exists and is OIDC-protected (STORY-007)

## Inputs
- Sign-out: `sessionId` cookie on the request
- Cleanup: Cloud Scheduler OIDC token in `Authorization` header (existing alerts cron mechanism)

## Outputs
- Sign-out: HTTP 200, `{ success: true }`, `Set-Cookie: sessionId=; HttpOnly; Max-Age=0; Path=/`
- Sign-out with missing/unknown cookie: HTTP 200, same cleared cookie (idempotent)
- Cleanup: deleted row count logged; cron endpoint returns existing JSON response structure
- `user_sessions` row deleted matching `sessionId` cookie value
- All rows with `expiresAt < NOW()` deleted by cleanup job

## Acceptance Criteria
- [ ] `POST /api/auth/signout` with valid session cookie returns 200 and deletes session from DB
- [ ] Session cookie cleared in response (Max-Age=0)
- [ ] `POST /api/auth/signout` with no cookie or invalid sessionId returns 200 (idempotent)
- [ ] After sign-out, the deleted sessionId is rejected by middleware (STORY-012 validates this)
- [ ] `cleanupExpiredSessions()` deletes all rows where `expiresAt < NOW()`
- [ ] Cleanup invoked from `/api/cron/alerts` endpoint (OIDC-protected)
- [ ] Cleanup reports number of deleted rows in logs
- [ ] Cleanup is idempotent: no expired sessions → no-op, no error

## Test Strategy Expectations

**Unit tests:**
- `signOut(sessionId)`: Prisma delete called with correct sessionId; no throw if record not found (P2025 handled)
- `cleanupExpiredSessions()`: Prisma deleteMany called with `expiresAt: { lt: new Date() }`; returns deleted count
- Sign-out route: cookie cleared in response regardless of whether session existed in DB

**Integration tests:**
- Full sign-out: create session → POST /api/auth/signout → 200 → row gone from user_sessions
- Sign-out with already-deleted session: POST again → 200 (no error)
- Cleanup: insert 3 expired rows + 1 non-expired row → run cleanup → only non-expired row remains
- Cleanup via cron endpoint: POST /api/cron/alerts with valid OIDC token → 200 → expired rows deleted

**Contract/schema tests:**
- Response body: `{ success: true }` (no session data, no user data)
- Cookie cleared: response has `Set-Cookie: sessionId=; ...Max-Age=0...`

**BDD acceptance tests:**
- "Given an authenticated user, when POST /api/auth/signout, then session deleted and cookie cleared"
- "Given a request with no session cookie, when POST /api/auth/signout, then 200 and no error"
- "Given 5 expired session rows, when cleanup runs, then all 5 rows deleted"

**E2E tests:** Sign-out E2E (sign-out button click → POST /api/auth/signout → redirect to /signin) is deferred to the first story that builds an authenticated page with a navigation header. STORY-014 covers only the /signin page; no sign-out button exists in EPIC-002's UI scope.

## Regression / Invariant Risks

**Sign-out throws on missing session:**
- Risk: Prisma throws P2025 on delete of non-existent row; client gets 500 instead of clean sign-out
- Protection: Unit test covers missing-record case; P2025 caught and treated as success

**Cookie not cleared:**
- Risk: Set-Cookie in sign-out response omits Max-Age=0 or uses wrong Path; browser retains stale cookie
- Protection: Contract tests verify cookie attributes in sign-out response

**Cleanup and lazy deletion conflict:**
- Risk: Both cleanup paths (lazy in validateSession, batch in cleanupExpiredSessions) attempt to delete the same row
- Protection: Both use idempotent deleteMany / delete with where clause; no conflict possible; Prisma ignores missing rows

**Invariants to protect:**
- Sign-out always returns 200 (idempotent; never 404 or 500 for missing session)
- Cookie always cleared in sign-out response regardless of DB state
- Cleanup never deletes non-expired sessions (`expiresAt < NOW()` filter strictly enforced)

## Key Risks / Edge Cases

**Cleanup runs Mon-Fri only:**
- All 6 Cloud Scheduler jobs are Mon-Fri; cleanup does not run on weekends
- Expired sessions may persist up to ~72 hours beyond expiry over a weekend
- Acceptable: expired sessions are rejected by middleware lazy cleanup on first access; no security impact

**Sign-out from multiple tabs:**
- User with app open in two tabs signs out from one; other tab's next request hits middleware and redirects
- Correct behavior; no special handling needed

**Session deleted mid-request:**
- Sign-out called while another request using the same session is in flight
- Second request's session lookup returns null; middleware redirects to /signin
- Acceptable race condition; no data corruption

**alerts cron endpoint schedule:**
- Currently a placeholder (EPIC-003 implementation pending); cleanup added alongside the future alerts implementation
- Cleanup runs regardless of whether the alerts business logic is implemented

## Definition of Done

- [ ] `POST /api/auth/signout` implemented at `src/app/api/auth/signout/route.ts`
- [ ] `cleanupExpiredSessions()` implemented at `src/modules/auth/cleanup.service.ts`
- [ ] Cleanup wired into `/api/cron/alerts/route.ts`
- [ ] Tests added and passing (unit, integration, contract)
- [ ] Traceability comments in source: ADR-011, PRD Section 9A
- [ ] Cleanup logs deleted row count (no PII in log output)

## Traceability

- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (session deletion on sign-out, daily cleanup cron)

---

**END STORY-013**
