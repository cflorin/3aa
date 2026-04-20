# STORY-010 — Admin User Creation, Password Reset, and User Deactivation API

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Enable the administrator to create user accounts, reset passwords, and deactivate or reactivate users via protected API endpoints, without self-service signup. This is the only account provisioning and lifecycle management path in V1: all user accounts are created and managed by the admin.

## Story
As a **system administrator**,
I want **protected API endpoints to create user accounts, reset passwords, and deactivate or reactivate users**,
so that **I can fully manage the user lifecycle without exposing a public registration path**.

## Outcome
- `POST /api/admin/users` creates a new user account with bcrypt-hashed password; returns 201 with `{ userId, email, fullName, createdAt }`
- `PATCH /api/admin/users/:userId/password` resets a user's password; returns 200 with `{ userId, updatedAt }`
- `PATCH /api/admin/users/:userId/active` deactivates or reactivates a user; returns 200 with `{ userId, isActive, updatedAt }`
- All endpoints protected by `x-api-key` header validated against `ADMIN_API_KEY` env var
- Deactivated users cannot sign in and existing sessions are rejected by middleware on next use
- Duplicate email addresses rejected with 409; passwords stored as bcrypt hashes (never plaintext)

## Scope In
- `POST /api/admin/users` — create a new user (email, password, optional fullName)
- `PATCH /api/admin/users/:userId/password` — reset a user's password by userId
- `PATCH /api/admin/users/:userId/active` — deactivate (`{ isActive: false }`) or reactivate (`{ isActive: true }`) a user
- Authentication: `x-api-key` header validated against `ADMIN_API_KEY` environment variable (Secret Manager in production)
- Password hashing: bcrypt, 10 salt rounds
- Input validation: email format, minimum 8-character password, valid UUID for userId in all PATCH paths
- Duplicate email: return 409 Conflict with message "Email already exists"
- Non-existent userId on any PATCH: return 404
- Deactivation does NOT delete sessions (middleware's `isActive` check rejects them on next use — lazy cleanup)
- Response on creation: `{ userId, email, fullName, createdAt }` (no password hash)
- Response on deactivation/reactivation: `{ userId, isActive, updatedAt }`

## Scope Out
- Self-service user registration (no public signup)
- User deletion / hard delete from DB (deactivation covers the launch requirement)
- Email change endpoint (PRD: admin changes email; deferred — not required to unblock any other epic)
- Password complexity requirements beyond minimum length (deferred to V2 per ADR-011)
- Session creation (this endpoint is account provisioning only)
- Admin UI (API only)

## Dependencies
- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** Section 9A (Admin creates accounts, no self-service signup; password reset admin-assisted)
- **RFCs:** RFC-002 (users table: email, password_hash, full_name, is_active, created_at)
- **ADRs:** ADR-011 (bcrypt 10 rounds, ADMIN_API_KEY gate, no self-service), ADR-007 (users table schema)
- **Upstream stories:** STORY-004 (users table migrated to production)

## Preconditions
- `users` table exists in database (migrated in STORY-004)
- `ADMIN_API_KEY` secret exists in Secret Manager and is injected into Cloud Run at runtime
- `bcrypt` package available in runtime

## Inputs
- Admin API key: `x-api-key` header
- Create: `{ email: string, password: string, fullName?: string }` JSON body
- Reset password: `{ newPassword: string }` JSON body + `userId` path parameter
- Deactivate/reactivate: `{ isActive: boolean }` JSON body + `userId` path parameter

## Outputs
- Created user record in `users` table (passwordHash stored, not raw password)
- HTTP 201 with `{ userId, email, fullName, createdAt }` on successful creation
- HTTP 200 with `{ userId, updatedAt }` on successful password reset
- HTTP 200 with `{ userId, isActive, updatedAt }` on successful deactivation/reactivation
- HTTP 401 on missing or invalid API key
- HTTP 409 on duplicate email
- HTTP 400 on invalid input (email format, password too short, non-boolean isActive)
- HTTP 404 on unknown userId for any PATCH path

## Acceptance Criteria
- [ ] `POST /api/admin/users` creates a user with bcrypt-hashed password; returns 201
- [ ] `PATCH /api/admin/users/:userId/password` updates the password hash; returns 200
- [ ] `PATCH /api/admin/users/:userId/active` sets `isActive` to the provided boolean; returns 200
- [ ] Deactivated user (`isActive=false`) cannot sign in (returns 401 from sign-in endpoint)
- [ ] Reactivated user (`isActive=true`) can sign in again
- [ ] Existing sessions for a deactivated user are rejected by middleware on next use (no immediate session deletion)
- [ ] Requests without a valid `x-api-key` header return 401; no user data leaks in error body
- [ ] A duplicate email address returns 409 with message "Email already exists"
- [ ] Password shorter than 8 characters returns 400
- [ ] Malformed email format returns 400
- [ ] Unknown userId on any PATCH path returns 404
- [ ] Response body for creation never includes `passwordHash`
- [ ] A user created via this endpoint can subsequently sign in (verified via STORY-011 integration)

## Test Strategy Expectations

**Unit tests:**
- bcrypt hash is applied (hash !== raw password; bcrypt.compare succeeds)
- Duplicate email detection path returns 409
- Missing/wrong API key returns 401 without touching DB
- Empty string API key treated as invalid (not as a valid key)
- Email format validation rejects: missing `@`, no domain, empty string
- Password length validation rejects strings shorter than 8 chars
- Deactivation sets isActive=false; reactivation sets isActive=true

**Integration tests:**
- Full creation flow: POST → user row in DB → hash stored → 201 returned
- Password reset flow: PATCH → password_hash updated in DB → old bcrypt hash no longer verifies old password
- Duplicate email: second POST with same email → 409, single row in DB
- Deactivation: PATCH isActive=false → users.isActive=false in DB → sign-in returns 401
- Reactivation: PATCH isActive=true → users.isActive=true in DB → sign-in succeeds
- Inactive user (is_active=false) can still have password reset (admin can re-enable access)

**Contract/schema tests:**
- Create request schema (email: string, password: string, fullName: string|undefined)
- Deactivation request schema ({ isActive: boolean })
- Response schema never includes password_hash
- 401 response body is `{ error: string }` only
- Deactivation response: `{ userId: string, isActive: boolean, updatedAt: string }`

**BDD acceptance tests:**
- "Given a valid admin API key, when I POST a new user, then the user is created and I receive userId and email"
- "Given a wrong API key, when I POST a new user, then I receive 401 and no user is created"
- "Given an existing email, when I POST a duplicate user, then I receive 409"
- "Given an active user, when I PATCH isActive=false, then user cannot sign in"
- "Given a deactivated user, when I PATCH isActive=true, then user can sign in again"

**E2E tests:** Not required for admin-only API (no UI)

## Regression / Invariant Risks

**Password stored in plaintext:**
- Risk: bcrypt bypassed (e.g., error handling shortcut), raw password enters DB
- Protection: Unit tests verify hash is applied on every creation and reset path

**API key bypass:**
- Risk: ADMIN_API_KEY check accidentally removed or misconfigured; endpoint becomes public
- Protection: Integration tests verify 401 on every path variant (POST, PATCH password, PATCH active)

**Response body leakage:**
- Risk: `passwordHash` or raw password accidentally serialised into a response
- Protection: Contract tests on response shape for every endpoint

**User enumeration via error messages:**
- Risk: 409 "Email already exists" leaks user existence to the public sign-in endpoint
- Protection: 409 is deliberate for admin context only; sign-in endpoint must use generic errors

**Invariants to protect:**
- Passwords always hashed with bcrypt (never plaintext in database)
- ADMIN_API_KEY gate enforced on every admin endpoint before any DB operation
- Response bodies never include passwordHash
- Empty string ADMIN_API_KEY is never treated as valid

## Key Risks / Edge Cases

**ADMIN_API_KEY edge cases:**
- Empty string in dev environment must not be treated as a valid key
- Secret Manager injection failure leaves env var undefined; must return 401, not 500

**bcrypt edge cases:**
- bcrypt is async; accidental use of sync version in async handler blocks Cloud Run event loop
- Large password input (>72 bytes): bcrypt truncates at 72 bytes; V1 known limitation

**Concurrent creation race:**
- Race condition between duplicate email check and INSERT; Prisma unique constraint is the final guard
- P2002 error must be caught and returned as 409, not 500

**Deactivation with active sessions:**
- Deactivation does not delete existing sessions; middleware rejects them on next request via isActive check
- If immediate session termination is required in future, add cascade delete to deactivation path

## Definition of Done

- [ ] Capability implemented (`POST /api/admin/users`, `PATCH /api/admin/users/:userId/password`, `PATCH /api/admin/users/:userId/active`)
- [ ] Tests added and passing (unit, integration, contract)
- [ ] Regression coverage: bcrypt applied, API key gate, response body shape, deactivation blocks sign-in
- [ ] Traceability comments in source: ADR-011, PRD Section 9A
- [ ] ADMIN_API_KEY env var documented in `.env.example`
- [ ] Logging: creation event (email, userId), reset event (userId), deactivation/reactivation event (userId, isActive) — no passwords or hashes logged

## Traceability

- **Epic:** EPIC-002 — Authentication & User Management
- **PRD:** /docs/prd/3_aa_product_full_v_1_prd_v_1.md §9A (Admin creates accounts, admin-assisted password reset)
- **RFC:** /docs/rfc/RFC-002-canonical-data-model-persistence.md (users table schema)
- **ADR:** /docs/adr/ADR-011-authentication-strategy-custom-email-password.md (bcrypt 10 rounds, admin API key, no self-service)

---

**END STORY-010**
