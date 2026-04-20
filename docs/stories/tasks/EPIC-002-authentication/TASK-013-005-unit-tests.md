# TASK-013-005 — Unit Tests

## Parent Story
STORY-013 — Sign-Out API and Expired Session Cleanup

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write unit tests for `signOut()`, `POST /api/auth/signout`, and `cleanupExpiredSessions()`. Update the STORY-007 alerts route unit test to handle the new `sessionCleanup` field in the response.

## Traceability
- ADR-011: idempotent sign-out; batch cleanup filter strictly lt:expiresAt

## Test Files

### File 1: `tests/unit/modules/auth/auth.service.signOut.test.ts`
**Scope:** `signOut()` only

```
jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    userSession: {
      deleteMany: jest.fn(),
    },
  },
}));
```

**Tests (4):**
1. `calls prisma.userSession.deleteMany with exact sessionId`
   - `await signOut('session-uuid-123')`
   - Verify `mockDeleteMany` called with `{ where: { sessionId: 'session-uuid-123' } }`
2. `does not throw when deleteMany returns count 0 (no row found)`
   - `mockDeleteMany.mockResolvedValueOnce({ count: 0 })`
   - `await signOut('non-existent-id')` — expect no throw
3. `returns void (no return value)`
   - Result of `signOut(...)` should be `undefined`
4. `prisma.userSession.delete (singular) is NOT called — deleteMany is used for idempotency`
   - Mock does not include `prisma.userSession.delete`; test verifies `deleteMany` called

---

### File 2: `tests/unit/api/auth/signout.test.ts`
**Scope:** `POST /api/auth/signout` route handler

```
jest.mock('@/modules/auth/auth.service', () => ({
  signOut: jest.fn(),
}));
```

**Tests (6):**
1. `returns 200 with { success: true } when sessionId cookie is present`
2. `returns 200 with { success: true } when no sessionId cookie is present`
3. `calls signOut(sessionId) when sessionId cookie is present`
4. `does NOT call signOut when no sessionId cookie present`
5. `response always clears sessionId cookie (Max-Age=0 or cookie deleted) — with cookie`
6. `response always clears sessionId cookie — without cookie`

---

### File 3: `tests/unit/modules/auth/cleanup.service.test.ts`
**Scope:** `cleanupExpiredSessions()`

```
jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    userSession: {
      deleteMany: jest.fn(),
    },
  },
}));
```

**Tests (4):**
1. `calls prisma.userSession.deleteMany with { expiresAt: { lt: expect.any(Date) } }`
2. `returns { count: N } matching the deleteMany result`
3. `returns { count: 0 } when no expired sessions exist (idempotent)`
4. `deleteMany filter uses Date type (not a string or number) — ensures correct Prisma query type`

---

### File 4: `tests/unit/api/cron/alerts.test.ts` — CREATED (new file)
**Scope:** `/api/cron/alerts` route handler — verifies cleanup is invoked

No existing test for this route handler. Create a new test file.

```
jest.mock('@/lib/scheduler-auth', () => ({
  verifySchedulerToken: jest.fn(),
}));
jest.mock('@/modules/auth/cleanup.service', () => ({
  cleanupExpiredSessions: jest.fn().mockResolvedValue({ count: 3 }),
}));
```

**Tests (3):**
1. `returns 200 with sessionCleanup.deletedCount when OIDC token is valid`
   - verifySchedulerToken resolves → cleanupExpiredSessions called → response contains `{ sessionCleanup: { deletedCount: 3 } }`
2. `calls cleanupExpiredSessions after OIDC auth`
   - Verify cleanupExpiredSessions was called
3. `returns 401 and does not call cleanupExpiredSessions when OIDC token is invalid`
   - verifySchedulerToken throws → cleanupExpiredSessions NOT called → 401 response

---

## Total Unit Test Count
4 + 6 + 4 + 3 = **17 new unit tests**

## Running Unit Tests
```
npx jest "tests/unit" --no-coverage
```

Expected: 114 tests passing (97 baseline + 17 new)

## Acceptance Criteria
- [ ] All 17 new unit tests pass
- [ ] signOut unit tests verify `deleteMany` (not `delete`) is used
- [ ] cleanupExpiredSessions tests verify `expiresAt: { lt: ... }` filter is used

## Definition of Done
- [ ] 4 test files created with traceability comments
- [ ] 114 unit tests total passing
- [ ] **Promotes TASK-013-001, TASK-013-002, TASK-013-003, TASK-013-004 to `done`**

---

**END TASK-013-005**
