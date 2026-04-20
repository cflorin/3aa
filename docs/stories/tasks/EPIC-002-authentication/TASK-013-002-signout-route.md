# TASK-013-002 — POST /api/auth/signout Route

## Parent Story
STORY-013 — Sign-Out API and Expired Session Cleanup

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create `src/app/api/auth/signout/route.ts` — the HTTP handler for `POST /api/auth/signout`. Always returns 200 with `{ success: true }` and the `sessionId` cookie cleared. Delegates session deletion to `AuthService.signOut()`.

## Traceability
- ADR-011: session cookie cleared on sign-out; idempotent (missing cookie or unknown session → 200)
- PRD §9A: sign-out endpoint; client responsible for redirect to /signin after 200

## File
`src/app/api/auth/signout/route.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-002: POST /api/auth/signout — delete session, clear cookie, return 200
// ADR-011: always 200 (idempotent); cookie cleared regardless of whether session existed
// PRD §9A: client redirects to /signin after receiving 200

import { NextRequest, NextResponse } from 'next/server';
import { signOut } from '@/modules/auth/auth.service';

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get('sessionId')?.value;

  if (sessionId) {
    await signOut(sessionId);
    console.log(`[STORY-013] sign-out: session deleted`);
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  // Clear cookie regardless of whether a session existed (idempotent)
  response.cookies.delete('sessionId');
  return response;
}
```

## Behaviour Contract

| Request | DB action | Response |
|---------|-----------|----------|
| Valid sessionId cookie | Delete session row | 200, cookie cleared |
| No cookie | No DB call | 200, cookie cleared |
| Cookie with unknown sessionId | deleteMany → 0 rows deleted (no error) | 200, cookie cleared |

## Key Constraints
- Always returns 200 — never 404 or 500 for missing/invalid session
- Cookie is always cleared in the response (Max-Age=0 or `cookies.delete`)
- `console.log` does NOT log the sessionId value (no PII/credential in logs)
- No ADMIN_API_KEY required — this endpoint requires an authenticated session (middleware protects it)
  BUT: `/api/auth/signout` is excluded from middleware matcher via `api/auth` prefix — the route itself does not need session validation since sign-out with a missing/invalid session is valid (idempotent)

## Acceptance Criteria
- [ ] Returns 200 with `{ success: true }` when valid session cookie present
- [ ] Returns 200 when no cookie present
- [ ] Returns 200 when cookie contains unknown sessionId
- [ ] Response always clears `sessionId` cookie
- [ ] Calls `signOut(sessionId)` only when cookie is present

## Definition of Done
- [ ] `src/app/api/auth/signout/route.ts` created with traceability comments
- [ ] **Cannot be marked `done` independently; promote with TASK-013-005 unit tests passing**

---

**END TASK-013-002**
