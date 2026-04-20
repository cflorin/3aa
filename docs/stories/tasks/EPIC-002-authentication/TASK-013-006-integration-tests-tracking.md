# TASK-013-006 — Integration Tests + Tracking Update

## Parent Story
STORY-013 — Sign-Out API and Expired Session Cleanup

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write integration tests for `POST /api/auth/signout` and `cleanupExpiredSessions()` against the real test DB. Update tracking documents and commit.

## Traceability
- ADR-011: idempotent sign-out; batch cleanup via cron; lazy cleanup stays in validateSession

## Test File
`tests/integration/api/auth/signout.test.ts` — CREATED

### Setup Pattern
```typescript
import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { POST } from '../../../../src/app/api/auth/signout/route';
import { cleanupExpiredSessions } from '../../../../src/modules/auth/cleanup.service';

const TEST_EMAIL = 'integration-signout@test.local';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

async function createUser() { ... }
async function createSession(userId: string, expiresAt: Date) { ... }
async function cleanup() { ... }
```

### Tests (9)

**Describe: POST /api/auth/signout — integration**

1. `returns 200 with { success: true } when valid session cookie present`
   - Create session → POST with cookie → expect 200 and body `{ success: true }`

2. `session row is deleted from DB after successful sign-out`
   - Create session → POST → query DB → row gone

3. `returns 200 when no sessionId cookie present`
   - POST with no cookies → expect 200

4. `returns 200 when sessionId cookie contains unknown (already-deleted) sessionId`
   - POST with a non-existent sessionId → expect 200

5. `response always clears the sessionId cookie (Max-Age=0)`
   - Create session → POST → check Set-Cookie header contains Max-Age=0 or `sessionId=;`

6. `second sign-out call with same sessionId returns 200 (idempotent)`
   - Create session → POST (first sign-out) → POST again with same sessionId → still 200

**Describe: cleanupExpiredSessions() — integration**

7. `deletes all expired session rows; returns correct count`
   - Create user; insert 3 expired sessions and 1 valid session
   - Run cleanup → expect `{ count: 3 }` returned
   - Query DB: only the valid session remains

8. `does not delete non-expired sessions`
   - Create user; insert 2 valid sessions (expiresAt in future)
   - Run cleanup → `{ count: 0 }`
   - Both sessions still in DB

9. `idempotent: no expired sessions → { count: 0 }, no error`
   - Ensure clean state (no expired sessions)
   - Run cleanup → `{ count: 0 }` — no throw

---

## Total Integration Test Count
**9 integration tests**

## Running Integration Tests
```
DATABASE_URL="postgresql://test_user:test_password@localhost:5433/aaa_test" npx jest "tests/integration" --no-coverage
```

Expected: 105 integration tests passing (96 baseline + 9 new)

## Full Suite
Expected: 114 unit + 105 integration = **219 total tests passing**

## Tracking Updates

### IMPLEMENTATION-PLAN-V1.md
- STORY-013 status: `validated` → `done`
- All tasks: ✅ ALL COMPLETE
- Evidence: 216 total tests, key behaviours verified
- Active Work: Current Story → STORY-014
- Completed Items: add STORY-013 ✅

### IMPLEMENTATION-LOG.md
Append entry with:
- Files created/modified
- Tests added
- Result: DONE
- Evidence: test counts, clean sign-out + batch cleanup verified
- Baseline Impact: NO
- Next Action: Begin STORY-014

## Acceptance Criteria
- [ ] All 9 integration tests pass
- [ ] Test 2 verifies session row deleted from DB
- [ ] Test 7 verifies only expired rows deleted, valid row preserved
- [ ] Test 6 verifies idempotent sign-out
- [ ] Implementation plan and log updated

## Definition of Done
- [ ] `tests/integration/api/auth/signout.test.ts` created
- [ ] All tests pass (full suite: 114 unit + 105 integration = 219 total)
- [ ] IMPLEMENTATION-PLAN-V1.md updated
- [ ] IMPLEMENTATION-LOG.md entry added
- [ ] Git commit: `[EPIC-002/STORY-013] Sign-out API and expired session cleanup`

---

**END TASK-013-006**
