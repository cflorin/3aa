# TASK-010-006 — Integration + Contract Tests + Tracking Update

## Parent Story
STORY-010 — Admin User Creation, Password Reset, and User Deactivation API

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write integration tests against a real test database (Docker Compose PostgreSQL), contract tests verifying response shapes, and update all tracking documents (IMPLEMENTATION-PLAN-V1.md, IMPLEMENTATION-LOG.md) to mark STORY-010 `done`.

## Traceability
- CLAUDE.md: mandatory tracking update after each story completion
- ADR-011: ADMIN_API_KEY gate, bcrypt verification, isActive enforcement
- STORY-012 dependency: deactivated user session rejection tested in STORY-012

## Test File
`tests/integration/api/admin/users.test.ts` — CREATED

---

## Integration Test Cases

```typescript
// EPIC-002: Authentication & User Management
// STORY-010: Admin User Creation API
// TASK-010-006: Integration tests against real test DB
// ADR-011: Full creation flow, auth gate, deactivation, error paths

describe('EPIC-002/STORY-010/TASK-010-006: POST /api/admin/users — integration', () => {
  it('creates user row in DB with bcrypt hash; 201 response — no passwordHash')
  it('stored passwordHash verifies against submitted password via bcrypt.compare')
  it('email stored in lowercase when submitted in uppercase')
  it('returns 409 and single DB row when duplicate email submitted')
  it('POST /api/admin/users: returns 401 with missing API key — no DB row inserted')
  it('PATCH /api/admin/users/[userId]/password: returns 401 with missing API key — no DB change')
  it('PATCH /api/admin/users/[userId]/active: returns 401 with missing API key — no DB change')
});

describe('EPIC-002/STORY-010/TASK-010-006: PATCH .../password — integration', () => {
  it('updates passwordHash in DB; old password no longer verifies; new password verifies')
  it('returns 404 for unknown userId; no DB modification')
});

describe('EPIC-002/STORY-010/TASK-010-006: PATCH .../active — integration', () => {
  it('sets isActive=false in DB; 200 response with { userId, isActive: false, updatedAt }')
  it('sets isActive=true for previously deactivated user; 200 response')
  it('returns 404 for unknown userId; no DB modification')
});
```

**Cross-story dependency — STORY-010 acceptance criterion #3:**
STORY-010 requires: "Deactivated user (isActive=false) cannot sign in (returns 401 from sign-in endpoint)."
This criterion requires `POST /api/auth/signin` which is implemented in STORY-011.
- The integration test for this criterion lives in STORY-011's test suite.
- STORY-010's DoD for this criterion is **conditionally satisfied**: it is considered met when STORY-011 ships and its integration test "POST /api/auth/signin with isActive=false user → 401" passes.
- STORY-010 may be marked `done` for all other criteria; this one is tracked as a forward dependency against STORY-011.

---

## Contract Test Cases (within integration test file)

```typescript
describe('EPIC-002/STORY-010/TASK-010-006: Contract — response shapes', () => {
  it('POST 201 response shape: { userId: string, email: string, fullName: string|null, createdAt: string }')
  it('POST 201 response does NOT contain passwordHash field')
  it('PATCH password 200 response shape: { userId: string, updatedAt: string }')
  it('PATCH active 200 response shape: { userId: string, isActive: boolean, updatedAt: string }')
  it('401 response shape: { error: string } — no user data leaked')
  it('409 response shape: { error: "Email already exists" }')
  it('404 response shape: { error: string }')
});
```

---

## Expected Test Count
- Integration tests: ~12 (2 extra from split 401 tests)
- Contract tests: ~7
- **Total new integration/contract tests: ~19**
- **Running total after STORY-010:** 69 (baseline) + 32 (unit) + 19 (integration/contract) = **~120 tests**

---

## Tracking Update — IMPLEMENTATION-PLAN-V1.md

Add under EPIC-002 section:

```
### STORY-010 — Admin User Creation, Password Reset, and User Deactivation API
- **Status:** done
- **Dependencies:** STORY-004 (users table), STORY-003 (ADMIN_API_KEY secret)
- **Tasks:** 6 (TASK-010-001 through TASK-010-006) ✅ ALL COMPLETE
  - TASK-010-001: Install bcrypt + create admin auth guard (src/lib/admin-auth.ts) ✅
  - TASK-010-002: POST /api/admin/users — create user with bcrypt hash ✅
  - TASK-010-003: PATCH /api/admin/users/[userId]/password — reset password ✅
  - TASK-010-004: PATCH /api/admin/users/[userId]/active — deactivate/reactivate ✅
  - TASK-010-005: Unit tests — auth guard (6) + routes (24) = 30 unit tests ✅
  - TASK-010-006: Integration + contract tests (17) + tracking update ✅
```

## Tracking Update — IMPLEMENTATION-LOG.md

```
## Entry: STORY-010 Complete — Admin User Management API

**Timestamp:** [ISO 8601 at completion]
**Epic:** EPIC-002
**Story:** STORY-010
**Tasks:** TASK-010-001 through TASK-010-006 — ALL COMPLETE

**Action:** Implemented admin user creation, password reset, and deactivation endpoints
with bcrypt password hashing, ADMIN_API_KEY gate, and full test coverage.

**Files Changed:**
- package.json — bcrypt added to dependencies, @types/bcrypt to devDependencies
- src/lib/admin-auth.ts — CREATED: validateAdminApiKey()
- src/app/api/admin/users/route.ts — CREATED: POST /api/admin/users
- src/app/api/admin/users/[userId]/password/route.ts — CREATED: PATCH reset password
- src/app/api/admin/users/[userId]/active/route.ts — CREATED: PATCH deactivate/reactivate
- docs/architecture/IMPLEMENTATION-PLAN-V1.md — STORY-010 → done

**Tests Added:**
- tests/unit/lib/admin-auth.test.ts — 6 unit tests (auth guard)
- tests/unit/api/admin/users.test.ts — 26 unit tests (all 3 routes)
- tests/integration/api/admin/users.test.ts — ~19 integration + contract tests

**Result/Status:** DONE
**Baseline Impact:** NO
**Evidence:**
- ~120 total tests passing (69 baseline + 51 new)
- POST /api/admin/users: 201 with hashed password stored
- PATCH .../password: password updated, old hash no longer verifies
- PATCH .../active: isActive toggled correctly
- 401 on all paths without valid ADMIN_API_KEY
```

## Acceptance Criteria
- [ ] All integration + contract tests pass (`npm test -- --testPathPattern=integration`)
- [ ] Tests use real test DB (Docker Compose PostgreSQL 15)
- [ ] bcrypt.compare used in integration tests to verify stored hash
- [ ] Each endpoint's 401 path verified without touching DB
- [ ] IMPLEMENTATION-PLAN-V1.md updated with STORY-010 tasks + `done` status
- [ ] IMPLEMENTATION-LOG.md updated with completion entry including test count evidence

## Definition of Done
- [ ] `tests/integration/api/admin/users.test.ts` created and passing
- [ ] All ~19 integration + contract tests green
- [ ] IMPLEMENTATION-PLAN-V1.md updated
- [ ] IMPLEMENTATION-LOG.md updated
- [ ] STORY-010 marked `done`

---

**END TASK-010-006**
