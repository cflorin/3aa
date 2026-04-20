# STORY-010 — Admin User Creation, Password Reset, and User Deactivation API

## Epic
EPIC-002 — Authentication & User Management

## Purpose
Enable the administrator to create user accounts, reset passwords, and deactivate or reactivate users via protected API endpoints, without self-service signup. This is the only account provisioning and lifecycle management path in V1: all user accounts are created and managed by the admin.

## Story
As the system administrator,
I want protected API endpoints to create user accounts, reset passwords, and deactivate or reactivate users,
so that I can fully manage the user lifecycle without exposing a public registration path.

## Outcome
The admin can create a new user account (email + password + optional full name), reset an existing user's password, and deactivate or reactivate a user via authenticated API calls. All other callers are rejected. Created accounts are immediately usable for sign-in. Deactivated users cannot sign in and existing sessions are rejected by middleware. Duplicate email addresses are rejected. Passwords are stored as bcrypt hashes (never plaintext).

## Scope In
- `POST /api/admin/users` — create a new user (email, password, optional fullName)
- `PATCH /api/admin/users/:userId/password` — reset a user's password by userId
- `PATCH /api/admin/users/:userId/active` — deactivate (`{ isActive: false }`) or reactivate (`{ isActive: true }`) a user
- Authentication: `x-api-key` header validated against `ADMIN_API_KEY` environment variable (Secret Manager in production)
- Password hashing: bcrypt, 10 salt rounds
- Input validation: email format, minimum 8-character password, valid UUID for userId in all PATCH paths
- Duplicate email: return 409 Conflict with clear message
- Non-existent userId on any PATCH: return 404
- Deactivation does NOT delete sessions (middleware's `isActive` check rejects them on next use; lazy cleanup)
- Response on creation: `{ userId, email, fullName, createdAt }` (no password hash)
- Response on deactivation/reactivation: `{ userId, isActive, updatedAt }`

## Scope Out
- Self-service user registration (no public signup)
- User deletion (hard delete from DB; deactivation covers the launch requirement)
- Email change endpoint (PRD: admin changes email; deferred — not required to unblock any other epic)
- Password complexity requirements beyond minimum length (deferred to V2 per ADR-011)
- "Remember me" or session creation (this endpoint is account provisioning only)
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
- `bcrypt` or equivalent library available in runtime

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
- [ ] Deactivated user (`isActive=false`) cannot sign in (STORY-011 integration: returns 401)
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
- **Unit tests:**
  - bcrypt hash is applied (hash !== raw password; bcrypt.compare succeeds)
  - Duplicate email detection path returns 409
  - Missing/wrong API key returns 401 without touching DB
  - Email format validation rejects: missing `@`, no domain, empty string
  - Password length validation rejects strings shorter than 8 chars
- **Integration tests:**
  - Full creation flow: POST → user row in DB → hash stored → 201 returned
  - Password reset flow: PATCH → password_hash updated in DB → old bcrypt hash no longer verifies old password
  - Duplicate email: second POST with same email → 409, single row in DB
  - Deactivation: PATCH isActive=false → users.isActive=false in DB → sign-in returns 401
  - Reactivation: PATCH isActive=true → users.isActive=true in DB → sign-in succeeds
  - Inactive user (is_active=false) can still have password reset (admin can re-enable access)
- **Contract/schema tests:**
  - Create request schema (email: string, password: string, fullName: string|undefined)
  - Deactivation request schema ({ isActive: boolean })
  - Response schema never includes password_hash
  - 401 response body is `{ error: string }` only
  - Deactivation response: `{ userId: string, isActive: boolean, updatedAt: string }`
- **BDD acceptance tests:**
  - "Given a valid admin API key, when I POST a new user, then the user is created and I receive userId and email"
  - "Given a wrong API key, when I POST a new user, then I receive 401 and no user is created"
  - "Given an existing email, when I POST a duplicate user, then I receive 409"
  - "Given an active user, when I PATCH isActive=false, then user cannot sign in"
  - "Given a deactivated user, when I PATCH isActive=true, then user can sign in again"
- **E2E tests:** Not required for admin-only API (no UI)

## Regression / Invariant Risks
- **Password never stored in plaintext:** If bcrypt is bypassed (e.g., error handling shortcut), raw password enters DB. Unit tests must verify hash is applied on every creation and reset path.
- **API key bypass:** If the ADMIN_API_KEY check is accidentally removed or misconfigured, the endpoint becomes a public user creation endpoint. Integration tests must verify 401 on every path variant.
- **Response body leakage:** If `passwordHash` or the raw password is accidentally serialised into a response, it is exposed. Contract tests on response shape catch this.
- **User enumeration via error messages:** "Email already exists" (409) is deliberate for admin context; the public sign-in endpoint must never expose this. Keep 409 response distinct from sign-in error messages.

## Key Risks / Edge Cases
- `ADMIN_API_KEY` is empty string in dev environment: must not treat empty string as a valid key
- bcrypt is async; ensure no accidental use of sync version in async handler (Cloud Run: sync bcrypt blocks event loop)
- Large password input (>72 bytes): bcrypt truncates at 72 bytes; document this as a known V1 limitation
- Concurrent creation of same email: Prisma unique constraint is the final guard; race condition between validation and insert must be handled gracefully (catch P2002 error)

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
