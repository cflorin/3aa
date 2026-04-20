# TASK-011-004 — Unit Tests: Rate Limiter + AuthService + Route

## Parent Story
STORY-011 — Sign-In API with Session Creation and Rate Limiting

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write unit tests for the rate limiter (pure logic), AuthService.signIn() (Prisma and bcrypt mocked), and the signin route handler (AuthService mocked). All tests run without a real database.

## Traceability
- ADR-011: bcrypt; constant-time unknown email; rate limit before DB; no sliding window
- CLAUDE.md: `describe('EPIC-002/STORY-011/TASK-011-004: ...')`

## Test Files
- `tests/unit/modules/auth/rate-limiter.test.ts` — CREATED
- `tests/unit/modules/auth/auth.service.test.ts` — CREATED
- `tests/unit/api/auth/signin.test.ts` — CREATED

---

## `tests/unit/modules/auth/rate-limiter.test.ts` — 8 tests

```typescript
import { isRateLimited, recordFailedAttempt, resetRateLimit, clearAll } from '@/modules/auth/rate-limiter';

describe('EPIC-002/STORY-011/TASK-011-004: rate limiter', () => {
  beforeEach(() => clearAll()); // reset module-level Map between tests

  it('isRateLimited returns false for a fresh email')
  it('isRateLimited returns false after 4 failed attempts')
  it('isRateLimited returns true after 5 failed attempts within window')
  it('isRateLimited returns false after window has expired (simulated via Date.now mock)')
  it('resetRateLimit clears the counter; isRateLimited returns false')
  it('two different emails have independent counters')
  it('isRateLimited is read-only: calling it does not change count')
  it('recordFailedAttempt in expired window starts a new window from count=1')
});
```

---

## `tests/unit/modules/auth/auth.service.test.ts` — 10 tests

```typescript
// Mocks: prisma.user.findUnique, prisma.userSession.create, prisma.user.update, bcrypt.compare
// Also mock rate-limiter module functions

describe('EPIC-002/STORY-011/TASK-011-004: AuthService.signIn', () => {
  it('returns { status: "rate-limited" } when isRateLimited is true — no DB query made')
  it('returns { status: "invalid-credentials" } and runs bcrypt against DUMMY_HASH when user not found')
  it('calls bcrypt.compare with DUMMY_HASH when user not found (constant-time protection)')
  it('calls recordFailedAttempt when credentials are invalid')
  it('returns { status: "invalid-credentials" } when bcrypt.compare returns false')
  it('returns { status: "invalid-credentials" } when user.isActive is false (bcrypt still runs)')
  it('returns { status: "success" } with sessionId, userId, email on valid credentials')
  it('creates user_sessions row with expiresAt ≈ now + 7 days on success')
  it('updates users.lastLoginAt on success')
  it('calls resetRateLimit on success')
});
```

---

## `tests/unit/api/auth/signin.test.ts` — 9 tests

```typescript
// Mocks: @/modules/auth/auth.service (signIn function)

describe('EPIC-002/STORY-011/TASK-011-004: POST /api/auth/signin route', () => {
  it('returns 400 when email is missing from body')
  it('returns 400 when password is missing from body')
  it('returns 400 when body is malformed JSON')
  it('returns 429 when signIn returns { status: "rate-limited" }')
  it('returns 401 when signIn returns { status: "invalid-credentials" }')
  it('returns 200 with { userId, email } when signIn returns success')
  it('response body does NOT contain password or passwordHash')
  it('Set-Cookie header contains sessionId with HttpOnly, SameSite=Lax, Max-Age=604800, Path=/')
  it('Secure flag absent in non-production; present when NODE_ENV=production')
});
```

## Expected Test Count
- `rate-limiter.test.ts`: 8 tests
- `auth.service.test.ts`: 10 tests
- `signin.test.ts`: 9 tests
- **Total new unit tests: 27**

## Acceptance Criteria
- [ ] All 27 unit tests pass
- [ ] No real DB connection used (Prisma mocked)
- [ ] Rate limiter checked before any DB mock call in auth service test
- [ ] DUMMY_HASH receives bcrypt.compare call when email is unknown
- [ ] Cookie attributes verified against ADR-011 spec
- [ ] Response body never contains password or passwordHash

## Definition of Done
- [ ] All three test files created and passing
- [ ] 27 new unit tests
- [ ] Promotes TASK-011-001, 002, 003 to `done`

---

**END TASK-011-004**
