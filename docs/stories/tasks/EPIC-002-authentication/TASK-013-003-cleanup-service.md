# TASK-013-003 — cleanupExpiredSessions() Service

## Parent Story
STORY-013 — Sign-Out API and Expired Session Cleanup

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create `src/modules/auth/cleanup.service.ts` with `cleanupExpiredSessions()` that batch-deletes all expired session rows from `user_sessions`. Called nightly from `/api/cron/alerts`.

## Traceability
- ADR-011: daily batch cleanup of expired sessions; complement to lazy cleanup in validateSession()
- PRD §9A: `user_sessions` table must not grow unboundedly

## File
`src/modules/auth/cleanup.service.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-003: cleanupExpiredSessions() — batch delete of expired user_sessions rows
// ADR-011: daily batch cleanup; complement to lazy single-row cleanup in validateSession()
// PRD §9A: sessions table bounded by nightly cleanup

import { prisma } from '@/infrastructure/database/prisma';

export async function cleanupExpiredSessions(): Promise<{ count: number }> {
  const result = await prisma.userSession.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  console.log(`[STORY-013] session cleanup: deleted ${result.count} expired session(s)`);
  return { count: result.count };
}
```

## Behaviour Contract
- Deletes all rows where `expiresAt < NOW()`
- No rows to delete → `{ count: 0 }` (idempotent, no error)
- Returns `{ count: number }` for logging/monitoring
- `console.log` uses the count — no PII in log output

## Key Constraints
- Uses `deleteMany` — atomic batch delete
- Filter is strictly `expiresAt < new Date()` — never deletes non-expired sessions
- Function is pure: no side effects beyond the Prisma call and console.log

## Acceptance Criteria
- [ ] Calls `prisma.userSession.deleteMany({ where: { expiresAt: { lt: new Date() } } })`
- [ ] Returns `{ count: result.count }`
- [ ] No error when no rows match the filter
- [ ] Does NOT delete sessions where `expiresAt >= NOW()`

## Definition of Done
- [ ] `src/modules/auth/cleanup.service.ts` created with traceability comments
- [ ] **Cannot be marked `done` independently; promote with TASK-013-005 unit tests passing**

---

**END TASK-013-003**
