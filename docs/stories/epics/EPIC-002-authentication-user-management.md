# EPIC-002 — Authentication & User Management

## Purpose
Enable multi-user access with secure email/password authentication, session management, and user isolation. Deliver Sign-In screen (Screen 1) as first user-facing capability. This epic establishes the foundation for per-user monitoring, overrides, and alerts.

## Outcome
Authenticated users can:
- Sign in with email/password via Sign-In screen
- Maintain sessions (7-day expiration, HTTP-only cookies)
- Access protected routes (Next.js middleware auth guard)
- Sign out securely
- Admins can create user accounts (no self-service signup)

**UI Delivered:** Screen 1 (Sign-In)

## Scope In
- User accounts table (`users`: email, password_hash, is_active, created_at, last_login_at)
- User sessions table (`user_sessions`: session_id, user_id, expires_at, ip_address, user_agent)
- Password hashing (bcrypt, salt rounds: 10)
- Session cookie management (HTTP-only, Secure, SameSite=Lax, 7-day expiration)
- **Screen 1: Sign-In UI** (email/password form, validation, error handling, success redirect)
- Sign-out functionality
- Next.js middleware auth guard (protect routes, redirect unauthenticated to /signin)
- Admin-only user management API (create user, reset password, deactivate/reactivate — STORY-010)
- Session expiration enforcement (fixed 7-day expiry; no sliding window per ADR-011)
- Rate limiting (5 sign-in attempts per 15 minutes per email)
- Session cleanup job (delete expired sessions)

## Scope Out
- Social login (Google, GitHub OAuth)
- Two-factor authentication (2FA)
- Self-service user registration UI
- Password reset workflow (admin-assisted for V1)
- Email verification
- User roles/permissions (all users have same access level for V1)
- "Remember me" checkbox (session duration fixed at 7 days)

## Dependencies
- **PRD:** Section 9A (Authentication & Multi-User Access), Section 9B Screen 1 (Sign-In)
- **RFCs:** RFC-002 (Data Model - users, user_sessions tables)
- **ADRs:** ADR-007 (Multi-User Architecture), ADR-010 (Next.js), ADR-011 (Custom Email/Password Auth)
- **Upstream epics:** EPIC-001 (Platform Foundation - requires database, Cloud Run)

## Inputs
- User credentials (email, password) from Sign-In form
- Admin-provided user data (email, initial password) for account creation
- Session cookie (for authenticated requests)

## Outputs
- Authenticated session (session_id cookie, user_id stored in session)
- Protected routes (middleware redirects unauthenticated users to /signin)
- User account records (`users` table)
- Active sessions (`user_sessions` table)
- **Screen 1: Sign-In UI** (functional email/password form)

## Flows Covered
- **Sign-In flow (UI):** User enters email/password on Sign-In screen → submit → client-side validation → POST /api/auth/signin → bcrypt verify → create session → set cookie → redirect to /universe
- **Session validation (middleware):** User requests protected route → middleware reads sessionId cookie → queries user_sessions → validates expiration + isActive → allows request or redirects to /signin
- **Sign-out flow:** User clicks Sign-Out → POST /api/auth/signout → delete session from user_sessions → clear cookie → redirect to /signin
- **Admin creates user:** Admin calls POST /api/admin/users with x-api-key header → bcrypt hash password → INSERT users → 201 returned
- **Admin deactivates user:** Admin calls PATCH /api/admin/users/:userId/active with `{ isActive: false }` → users.isActive set to false → existing sessions rejected by middleware on next use
- **Rate limiting:** Track failed sign-in attempts per email → >5 attempts in 15 min → block further attempts → return 429
- **Expired session cleanup:** Nightly cron (/api/cron/alerts, Mon-Fri) → DELETE FROM user_sessions WHERE expires_at < NOW(); lazy single-row cleanup also occurs in validateSession()

## Acceptance Criteria
- [ ] `users` table created with email unique constraint, password_hash not null
- [ ] `user_sessions` table created with foreign key to users(user_id) ON DELETE CASCADE
- [ ] Password hashing uses bcrypt (salt rounds: 10, verified in tests)
- [ ] Sign-In screen UI functional (email/password form, submit button, error display)
- [ ] Sign-In endpoint validates email/password, returns session cookie on success (`POST /api/auth/signin`)
- [ ] Session cookie is HTTP-only, Secure (HTTPS), SameSite=Lax, 7-day expiration
- [ ] Session expiration enforced (expired sessions rejected by middleware)
- [ ] Next.js middleware protects routes (redirects unauthenticated users to /signin)
- [ ] Sign-out endpoint deletes session and clears cookie (`POST /api/auth/signout`)
- [ ] Admin can create user accounts via `POST /api/admin/users` (x-api-key protected)
- [ ] Admin can reset passwords via `PATCH /api/admin/users/:userId/password`
- [ ] Admin can deactivate/reactivate users via `PATCH /api/admin/users/:userId/active`
- [ ] Rate limiting prevents brute force (5 attempts per 15 min per email, enforced)
- [ ] Invalid credentials return generic error message (no email enumeration: "Invalid email or password")
- [ ] User `is_active` flag enforced (inactive users cannot sign in; deactivated sessions rejected)
- [ ] Expired session cleanup job functional (nightly via /api/cron/alerts + lazy cleanup in validateSession)

## Test Strategy Expectations

**Unit tests:**
- Password hashing (bcrypt.hash → bcrypt.compare succeeds, mismatch fails)
- Session expiration calculation (new session → expires_at = now + 7 days)
- Rate limiting logic (track attempts, enforce 5 per 15 min threshold, reset after window)
- Email validation (valid formats pass, invalid formats fail: missing @, no domain, etc.)
- Session cookie serialization (sessionId → cookie string with correct attributes)

**Integration tests:**
- Sign-in flow with valid credentials (POST /api/auth/signin → session created → cookie set → user_sessions row inserted)
- Sign-in with invalid password (POST /api/auth/signin → 401 Unauthorized → no session created)
- Sign-in with inactive user (is_active=FALSE → error returned, no session created)
- Sign-in with non-existent email (email not in users table → generic error, no enumeration)
- Session validation with valid cookie (middleware → session found → expires_at valid → request allowed)
- Session validation with expired session (middleware → expires_at < NOW() → redirect to /signin)
- Sign-out flow (POST /api/auth/signout → session deleted from user_sessions → cookie cleared)
- Admin account creation (POST /api/admin/users → user inserted → password hashed → can sign in)
- Admin deactivation (PATCH /api/admin/users/:userId/active → isActive=false → sign-in returns 401)
- Rate limiting enforcement (6 failed attempts → 7th blocked → rate limit error)

**Contract/schema tests:**
- `users` table schema (email VARCHAR UNIQUE, password_hash VARCHAR NOT NULL, is_active BOOLEAN DEFAULT TRUE)
- `user_sessions` table schema (session_id UUID PK, user_id UUID FK, expires_at TIMESTAMPTZ NOT NULL)
- Session cookie format (HTTP-only, Secure, SameSite=Lax attributes present)
- Sign-In request schema (POST /api/auth/signin body: {email, password})
- Sign-In response schema (success: `{ userId, email }`, error: `{ error: string }`)

**BDD acceptance tests:**
- "Given valid credentials, when user submits sign-in form, then session created and redirected to /universe"
- "Given invalid password, when user submits sign-in form, then generic error displayed and no session created"
- "Given expired session, when accessing protected route, then redirected to /signin"
- "Given authenticated user, when user clicks sign-out, then session deleted and redirected to /signin"
- "Given 5 failed sign-in attempts, when 6th attempt made within 15 min, then rate limit error returned"
- "Given inactive user (is_active=FALSE), when sign-in attempted, then error returned"

**E2E tests:**
- Full sign-in flow (render Sign-In screen → fill email/password → submit → redirected to /universe → authenticated)
- Full sign-out flow (authenticated user → click Sign-Out button → redirected to /signin → cannot access /universe)
- Protected route access without auth (navigate to /universe without session → redirected to /signin)
- Session persistence (sign in → close browser → reopen → session valid for 7 days)

## Regression / Invariant Risks

**Password security risks:**
- Risk: Password stored in plaintext (bcrypt not applied)
- Protection: Unit tests verify bcrypt hashing, code review enforces pattern

**Session hijacking risks:**
- Risk: Session cookie not HTTP-only (vulnerable to XSS)
- Protection: Contract tests validate cookie attributes, middleware enforces HTTP-only

**User enumeration risks:**
- Risk: Different error messages for "email not found" vs "wrong password"
- Protection: Integration tests verify generic error message, code enforces same message

**Brute force risks:**
- Risk: No rate limiting (attacker tries unlimited passwords)
- Protection: Integration tests verify rate limit enforcement

**Session fixation risks:**
- Risk: Session ID not regenerated on sign-in (attacker pre-sets session)
- Protection: New session created on every sign-in, old session invalidated

**Expired session cleanup risks:**
- Risk: Expired sessions not deleted (database bloat, security risk)
- Protection: Integration tests verify cleanup job, cron job scheduled

**Invariants to protect:**
- Passwords always hashed with bcrypt (never plaintext in database)
- Session cookies always HTTP-only, Secure, SameSite=Lax
- User isolation enforced (User A cannot access User B's session)
- Expired sessions cannot authenticate (middleware validates expiration before allowing access)
- Inactive users cannot sign in (is_active flag checked before session creation)
- Email uniqueness enforced (cannot create duplicate user accounts)
- Rate limiting always applied (no bypass for repeated failed attempts)
- Generic error messages (no user enumeration via error text differences)

## Key Risks / Edge Cases

**Security edge cases:**
- Timing attack on password comparison (bcrypt.compare leaks timing info via response time)
- Session fixation (attacker provides sessionId before sign-in, session not regenerated)
- CSRF attack on sign-out (attacker forces sign-out via GET request)
- XSS attack steals session cookie (if not HTTP-only)
- Expired session still in cookie (middleware must validate expiration, not just presence)

**Multi-session edge cases:**
- User signs in from multiple devices (multiple active sessions allowed, all valid)
- User signs in again while session active (new session created, old session remains valid or invalidated?)
- Admin deletes user while session active (session validation fails gracefully, redirects to sign-in)

**Rate limiting edge cases:**
- Distributed rate limiting (multiple Cloud Run instances, rate limit state inconsistent)
- Rate limit window edge (attempt at 14:59, another at 15:01 - different windows?)
- Rate limit by IP vs email (V1 uses email, but same IP multiple emails?)

**Operational edge cases:**
- Session table bloat (1M expired sessions not cleaned up)
- Clock skew (server time vs client time, session expiration calculated incorrectly)
- Admin forgets user password (no self-service reset, admin must manually update password_hash)
- User account deleted while session active (foreign key CASCADE deletes session, user logged out)

## Stories

- **STORY-010:** Admin User Creation, Password Reset, and User Deactivation API (`POST /api/admin/users`, `PATCH /api/admin/users/:userId/password`, `PATCH /api/admin/users/:userId/active`)
- **STORY-011:** Sign-In API with Session Creation and Rate Limiting (`POST /api/auth/signin`, bcrypt verify, session insert, in-memory rate limiting)
- **STORY-012:** Session Validation Middleware and Route Protection (`src/middleware.ts`, `getCurrentUser()` protected-route helper)
- **STORY-013:** Sign-Out API and Expired Session Cleanup (`POST /api/auth/signout`, `cleanupExpiredSessions()` wired to `/api/cron/alerts`)
- **STORY-014:** Sign-In Page UI — Screen 1 (`/signin`, email/password form, error display, redirect to /universe)

## Definition of Done

- [ ] Implementation complete (sign-in, sign-out, session validation, admin account creation, Sign-In UI)
- [ ] Tests added and passing (unit, integration, contract, BDD, E2E for auth flows)
- [ ] Regression coverage added (password hashing, session validation, rate limiting, cookie attributes)
- [ ] Docs updated (README auth section, admin account creation guide, Sign-In screen screenshot)
- [ ] Telemetry/logging added (sign-in attempts, sign-in success/failure, session creation, auth errors)
- [ ] Migrations included (users, user_sessions tables committed)
- [ ] Traceability links recorded (code comments reference ADR-011, PRD Section 9A)
- [ ] Security review completed (password hashing verified, session cookies validated, rate limiting tested)
- [ ] Admin API tested (POST /api/admin/users, PATCH password, PATCH active all verified with integration tests)
- [ ] Sign-In screen accessible at /signin (renders correctly, form functional, redirects to /universe on success)

## Traceability

- **PRD:** Section 9A (Authentication & Multi-User Access), Section 9B Screen 1 (Sign-In)
- **RFC:** RFC-002 (Data Model - users, user_sessions)
- **ADR:** ADR-007 (Multi-User Architecture - user isolation), ADR-010 (Next.js), ADR-011 (Custom Email/Password Auth)

---

**END EPIC-002**
