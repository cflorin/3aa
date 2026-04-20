# TASK-012-005 — Integration Tests + Tracking Update

## Parent Story
STORY-012 — Session Validation Middleware and Route Protection

## Epic
EPIC-002 — Authentication & User Management

## Objective
Write integration tests for `validateSession()` against the real test DB. Update IMPLEMENTATION-PLAN-V1.md and IMPLEMENTATION-LOG.md for STORY-012 completion. Commit all STORY-012 work.

## Traceability
- ADR-011: lazy cleanup on session expiry; inactive user check

## Test File
`tests/integration/modules/auth/validateSession.test.ts` — CREATED

### Setup/Teardown Pattern
```typescript
import { prisma } from '../../../../src/infrastructure/database/prisma';
import { validateSession } from '../../../../src/modules/auth/auth.service';
import bcrypt from 'bcrypt';

const TEST_EMAIL = 'integration-validate-session@test.local';

async function createUser() {
  const passwordHash = await bcrypt.hash('password', 10);
  return prisma.user.create({ data: { email: TEST_EMAIL, passwordHash } });
}

async function cleanup() {
  await prisma.userSession.deleteMany({ where: { user: { email: TEST_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

afterAll(async () => { await prisma.$disconnect(); });
```

### Tests (8)

**Describe: EPIC-002/STORY-012/TASK-012-005: validateSession() — integration**

1. `returns null for unknown sessionId (no DB rows present)`
   - Call validateSession('non-existent-uuid')
   - Expect null returned

2. `returns { userId, email } for a valid active session`
   - Create user + session (expiresAt = now + 7 days)
   - Call validateSession(session.sessionId)
   - Expect { userId: user.userId, email: TEST_EMAIL }

3. `returns null for expired session`
   - Create user + session with expiresAt = now - 1 second
   - Call validateSession(session.sessionId)
   - Expect null

4. `deletes expired session row from DB`
   - Create user + session with expiresAt = now - 1 second
   - Call validateSession(session.sessionId)
   - Query DB: userSession.findUnique(sessionId) → expect null (row deleted)

5. `does NOT delete valid session row on successful validation`
   - Create user + valid session
   - Call validateSession(session.sessionId)
   - Query DB: userSession.findUnique(sessionId) → expect row still exists

6. `returns null for inactive user session; row NOT deleted`
   - Create user with isActive=false + valid session
   - Call validateSession(session.sessionId)
   - Expect null
   - Query DB: session row still exists

7. `does not update lastActivityAt (no sliding window per ADR-011)`
   - Create user + valid session; record user.lastLoginAt before
   - Call validateSession(session.sessionId)
   - Fetch user again; lastLoginAt unchanged (same as before validation)

8. `returns null for valid session of user that was deactivated after session creation`
   - Create user + session; then update user.isActive = false
   - Call validateSession(session.sessionId)
   - Expect null (session survives, but access denied)

---

## Total Integration Test Count
**8 integration tests**

## Running Integration Tests
```
DATABASE_URL="postgresql://test_user:test_password@localhost:5433/aaa_test" npx jest "tests/integration" --no-coverage
```

Expected: 96 integration tests passing (88 baseline + 8 new)
Note: unit total is 97 (76 baseline + 21 new from TASK-012-004)

## Tracking Updates

### IMPLEMENTATION-PLAN-V1.md
- STORY-012 status: `ready` → `done`
- All tasks: ✅ ALL COMPLETE
- Evidence: total test count, key behaviours verified
- Active Work: update Current Story → STORY-013
- Completed Items: add STORY-012 ✅

### IMPLEMENTATION-LOG.md
Append entry with:
- Files created/modified
- Tests added
- Result: DONE
- Evidence: test counts
- Baseline Impact: NO
- Next Action: Begin STORY-013

## Acceptance Criteria
- [ ] All 8 integration tests pass
- [ ] Test 4 verifies expired session row deleted from DB
- [ ] Test 6 verifies inactive user session row NOT deleted
- [ ] Test 7 verifies lastActivityAt not updated (ADR-011 invariant)
- [ ] Implementation plan and log updated

## Definition of Done
- [ ] `tests/integration/modules/auth/validateSession.test.ts` created
- [ ] All tests pass (full suite: 97 unit + 96 integration = 193 total — verify exact count)
- [ ] IMPLEMENTATION-PLAN-V1.md updated
- [ ] IMPLEMENTATION-LOG.md entry added
- [ ] Git commit: `[EPIC-002/STORY-012] Session validation middleware and route protection`

---

**END TASK-012-005**
