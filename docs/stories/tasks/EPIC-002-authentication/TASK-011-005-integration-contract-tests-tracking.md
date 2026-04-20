# TASK-011-005 — Integration + Contract Tests + Tracking Update

## Parent Story
STORY-011 — Sign-In API with Session Creation and Rate Limiting

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write integration tests against a real test database (Docker Compose PostgreSQL), contract tests verifying response shapes and cookie attributes, satisfy the STORY-010 cross-story dependency, and update all tracking documents.

## Traceability
- CLAUDE.md: mandatory tracking update after story completion
- ADR-011: Full sign-in flow; rate limiting; cookie attributes
- STORY-010 cross-story dependency: "deactivated user blocked at sign-in" test lives here

## Test File
`tests/integration/api/auth/signin.test.ts` — CREATED

---

## Integration Test Cases (~13)

```typescript
describe('EPIC-002/STORY-011/TASK-011-005: POST /api/auth/signin — integration', () => {
  // setup: create active user via prisma.user.create before tests

  it('returns 200, inserts session row, sets Set-Cookie when credentials valid')
  it('session row expiresAt is approximately now + 7 days (±30 seconds)')
  it('users.lastLoginAt is updated on successful sign-in')
  it('two successful sign-ins create two independent session rows')
  it('returns 401 and inserts no session row when password is wrong')
  it('returns 401 and inserts no session row for unknown email')
  it('returns 401 and inserts no session row when user isActive=false')

  // Cross-story STORY-010 dependency: deactivated user blocked at sign-in
  it('[STORY-010 AC] user created via admin API then deactivated returns 401 at sign-in')
});

describe('EPIC-002/STORY-011/TASK-011-005: Rate limit — integration', () => {
  // Rate limiter state is module-level. Import clearAll() from rate-limiter and call
  // in beforeEach to ensure state is clean between integration test runs.
  // beforeEach(() => clearAll());

  it('5 failed attempts → 6th returns 429')
  it('successful sign-in resets counter; subsequent failures count from 0')
});
```

---

## Contract Test Cases (~7)

```typescript
describe('EPIC-002/STORY-011/TASK-011-005: Contract — response shapes', () => {
  it('200 response body: { userId: string, email: string } — no passwordHash, no password')
  it('200 response body has exactly 2 keys: userId and email')
  it('401 response body: { error: "Invalid email or password" } — same for wrong password AND unknown email')
  it('429 response body: { error: "Too many sign-in attempts. Please try again later." }')
  it('400 response body: { error: "Email and password are required" }')
  it('200 Set-Cookie contains: HttpOnly, SameSite=Lax, Max-Age=604800, Path=/')
  it('sessionId cookie value is a valid UUID')
});
```

---

## STORY-010 Cross-Story Dependency Resolution

The integration test "[STORY-010 AC] user created via admin API then deactivated returns 401" satisfies STORY-010 Acceptance Criterion: "Deactivated user (isActive=false) cannot sign in." This is the evidence required for that criterion to be marked complete.

---

## Expected Test Count
- Integration tests: ~10
- Contract tests: ~7
- **Total new integration/contract tests: ~17**
- **Running total after STORY-011:** 120 (baseline) + 27 (unit) + 17 (integration/contract) = **~164 tests**

---

## Tracking Update — IMPLEMENTATION-PLAN-V1.md

```
### STORY-011 — Sign-In API with Session Creation and Rate Limiting
- Status: done
- Tasks: 5 (TASK-011-001 through TASK-011-005) ✅ ALL COMPLETE
  - TASK-011-001: In-memory rate limiter (src/modules/auth/rate-limiter.ts) ✅
  - TASK-011-002: AuthService — signIn() + validateSession() stub + signOut() stub ✅
  - TASK-011-003: POST /api/auth/signin route with cookie ✅
  - TASK-011-004: Unit tests — rate limiter (8) + AuthService (10) + route (9) = 27 ✅
  - TASK-011-005: Integration + contract tests (17) + tracking update ✅
```

## Tracking Update — IMPLEMENTATION-LOG.md

Key fields to record on completion:
- **Files changed:** 3 source files + 3 test files + tracking docs
- **Tests added:** 27 unit + 17 integration/contract = 44 new tests
- **Running total:** ~164
- **Evidence:** POST /api/auth/signin returns 200 + cookie; session in DB; rate limit blocks at attempt 6; STORY-010 deactivation cross-story dependency satisfied
- **Baseline impact:** NO
- **Cross-story note:** STORY-010 AC "deactivated user blocked at sign-in" now satisfied — integration test evidence in this file

## Acceptance Criteria
- [ ] All integration + contract tests pass
- [ ] `[STORY-010 AC]` integration test passes (deactivated user → 401)
- [ ] Real test DB used (Docker Compose PostgreSQL 15)
- [ ] Rate limit integration test resets state correctly between runs
- [ ] IMPLEMENTATION-PLAN-V1.md updated; STORY-011 → done
- [ ] IMPLEMENTATION-LOG.md updated with evidence and cross-story note

## Definition of Done
- [ ] `tests/integration/api/auth/signin.test.ts` created and all tests passing
- [ ] ~17 integration + contract tests green
- [ ] STORY-010 cross-story dependency documented and test passing
- [ ] Tracking documents updated
- [ ] STORY-011 marked `done`

---

**END TASK-011-005**
