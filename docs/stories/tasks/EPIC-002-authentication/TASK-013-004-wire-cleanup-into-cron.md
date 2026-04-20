# TASK-013-004 — Wire cleanupExpiredSessions into /api/cron/alerts

## Parent Story
STORY-013 — Sign-Out API and Expired Session Cleanup

## Epic
EPIC-002 — Authentication & User Management

## Objective
Modify `src/app/api/cron/alerts/route.ts` to call `cleanupExpiredSessions()` after the OIDC auth check. Cleanup runs nightly (Mon-Fri, 8:30pm ET) alongside the existing alerts placeholder.

## Traceability
- ADR-011: expired session cleanup via daily cron endpoint; all 6 cron slots are Mon-Fri
- STORY-007: OIDC-protected `/api/cron/alerts` is the chosen cleanup slot (final step of nightly pipeline)

## File
`src/app/api/cron/alerts/route.ts` — MODIFIED

## Current State
```typescript
// Current (placeholder — EPIC-006 will add alerts logic)
export async function POST(request: Request) {
  try {
    await verifySchedulerToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    message: 'Alerts placeholder - implementation in EPIC-006',
    timestamp: new Date().toISOString(),
  });
}
```

## Target State
```typescript
// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-004: cleanupExpiredSessions() wired into nightly alerts cron
// ADR-011: batch cleanup of expired sessions; Mon-Fri only (all scheduler slots are weekdays)
// STORY-007: OIDC auth gate already in place

import { NextResponse } from 'next/server';
import { verifySchedulerToken } from '@/lib/scheduler-auth';
import { cleanupExpiredSessions } from '@/modules/auth/cleanup.service';

export async function POST(request: Request) {
  try {
    await verifySchedulerToken(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { count } = await cleanupExpiredSessions();

  return NextResponse.json({
    message: 'Alerts placeholder - implementation in EPIC-006',
    sessionCleanup: { deletedCount: count },
    timestamp: new Date().toISOString(),
  });
}
```

## Key Changes
1. Import `cleanupExpiredSessions` from `@/modules/auth/cleanup.service`
2. Call cleanup after OIDC auth, before returning response
3. Include `sessionCleanup: { deletedCount: count }` in response body
4. Existing OIDC auth unchanged; existing `message` field preserved for forward-compatibility with EPIC-006

## Existing Regression Risk
The existing STORY-007 unit test for the alerts endpoint checks the response body. Adding `sessionCleanup` to the response body will break this test. Fix: update the STORY-007 test to accept the new field OR use `expect.objectContaining({...})`.

**This is a planned regression on a test from STORY-007. It must be updated as part of TASK-013-004.**

## Acceptance Criteria
- [ ] `cleanupExpiredSessions()` called after OIDC auth check
- [ ] `sessionCleanup.deletedCount` present in response body
- [ ] OIDC auth still enforced (401 if token invalid)
- [ ] Existing STORY-007 unit tests updated to pass with new response shape

## Definition of Done
- [ ] `src/app/api/cron/alerts/route.ts` modified with traceability comment added
- [ ] STORY-007 unit test for alerts updated to accommodate new `sessionCleanup` field
- [ ] **Cannot be marked `done` independently; promote with TASK-013-005 unit tests passing**

---

**END TASK-013-004**
