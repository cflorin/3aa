# TASK-012-004 — Unit Tests

## Parent Story
STORY-012 — Session Validation Middleware and Route Protection

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write unit tests for `validateSession()`, `middleware()`, and `getCurrentUser()`. All DB calls and the Next.js `headers()` function are mocked. Coverage target: all branches in all three functions.

## Traceability
- ADR-011: constant-time sessions; no sliding window
- ADR-007: x-user-id overwrite prevents spoofing

## Test Files

### File 1: `tests/unit/modules/auth/auth.service.validateSession.test.ts`
**Scope:** `validateSession()` only (separate file to keep concerns isolated from signIn tests)

```
jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    userSession: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      update: jest.fn(), // included so test 7 can assert it was never called
    },
  },
}));
```

**Tests (7):**
1. `returns null when sessionId not found in DB` — findUnique returns null
2. `returns { userId, email } for a valid active session` — valid session, user.isActive=true
3. `returns null for expired session; calls prisma.userSession.delete` — expiresAt in past; verifies delete called with { where: { sessionId } }
4. `does NOT call prisma.userSession.delete for unknown sessionId` — findUnique null; delete not called
5. `returns null when user.isActive is false; does NOT delete session row` — valid expiry, isActive=false; delete not called
6. `returns { userId, email } — no full User object leaked` — verify only userId and email fields returned, no passwordHash, no fullName
7. `never updates lastActivityAt` — verify prisma.user.update never called (no sliding window, ADR-011)

---

### File 2: `tests/unit/middleware.test.ts`
**Scope:** `middleware()` function from `src/middleware.ts`

```
jest.mock('@/modules/auth/auth.service', () => ({
  validateSession: jest.fn(),
}));
```

**Tests (8):**
1. `redirects to /signin when no sessionId cookie is present` — res.status 307 or 302; Location: /signin; validateSession not called
2. `redirects to /signin and clears cookie when validateSession returns null` — cookie 'sessionId' deleted in response; Location: /signin
3. `forwards request with x-user-id and x-user-email when session is valid` — response is not a redirect; request headers contain userId and email
4. `x-user-id header value is the userId returned by validateSession` — verify exact value set
5. `x-user-email header value is the email returned by validateSession` — verify exact value set
6. `client-supplied x-user-id header is overwritten, not appended` — req contains x-user-id: 'attacker-id'; after middleware, x-user-id is validateSession result
7. `validateSession is called with the exact sessionId from cookie` — verify call arg matches cookie value
8. `does NOT delete cookie when no sessionId cookie exists` — verify response has no Set-Cookie deleting sessionId when cookie was absent
9. `/api/auth/signin` path: middleware would be excluded by matcher — test that the matcher regex does NOT match '/api/auth/signin'

---

### File 3: `tests/unit/lib/auth.test.ts`
**Scope:** `getCurrentUser()` from `src/lib/auth.ts`

```
jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));
```

**Tests (5):**
1. `returns { userId, email } when both x-user-id and x-user-email headers are present`
2. `returns null when x-user-id header is absent`
3. `returns null when x-user-email header is absent`
4. `returns null when both headers are absent`
5. `returned userId and email match the header values exactly` — verify no transformation

---

## Total Unit Test Count
7 + 9 + 5 = **21 unit tests**

## Running Unit Tests
```
npx jest "tests/unit" --no-coverage
```

Expected: 97 tests passing (76 baseline + 21 new)

## Acceptance Criteria
- [ ] All 21 unit tests pass
- [ ] `prisma.user.update` never called in validateSession tests (no lastActivityAt update)
- [ ] `prisma.userSession.delete` called only for expired sessions, not for invalid or inactive-user sessions
- [ ] Middleware test verifies x-user-id overwrite behaviour

## Definition of Done
- [ ] All 3 test files created with traceability comments
- [ ] 20 tests passing
- [ ] **Promotes TASK-012-001, TASK-012-002, and TASK-012-003 to `done`**

---

**END TASK-012-004**
