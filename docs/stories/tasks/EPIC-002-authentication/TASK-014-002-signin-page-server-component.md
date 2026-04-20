# TASK-014-002 — Sign-In Page Server Component

## Parent Story
STORY-014 — Sign-In Page UI (Screen 1)

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create `src/app/signin/page.tsx` as a Next.js App Router Server Component. Reads the `sessionId` cookie directly (not via `getCurrentUser()`, which depends on middleware that doesn't run on `/signin`), calls `validateSession()`, and redirects already-authenticated users to `/universe`.

## Traceability
- ADR-011: middleware excludes `/signin`; Server Component must call validateSession() directly
- PRD §9A / Screen 1: already-authenticated redirect to home

## File
`src/app/signin/page.tsx` — CREATED

## Why NOT getCurrentUser() Here
`getCurrentUser()` reads `x-user-id` headers injected by middleware. But `/signin` is excluded from the middleware matcher. The headers are never set. `getCurrentUser()` always returns null on this page. The page must read the `sessionId` cookie directly via `cookies()` and call `validateSession()`.

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-014: Sign-In Page UI (Screen 1)
// TASK-014-002: /signin Server Component — reads sessionId cookie directly for already-auth redirect
// ADR-011: /signin excluded from middleware; getCurrentUser() not available here
// PRD §9A / Screen 1: redirect already-authenticated users to /universe

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSession } from '@/modules/auth/auth.service';
import SignInForm from './SignInForm';

export default async function SignInPage() {
  const sessionId = cookies().get('sessionId')?.value;

  if (sessionId) {
    const user = await validateSession(sessionId);
    if (user) {
      redirect('/universe');
    }
  }

  return (
    <main>
      <SignInForm />
    </main>
  );
}
```

## Key Constraints
- Must be an `async` function (calls `validateSession()` which is async)
- `cookies()` from `next/headers` is synchronous in Next.js 14
- `redirect('/universe')` throws a Next.js redirect (this is how App Router redirects work)
- If `sessionId` is absent or session is invalid/expired, page renders normally (no redirect)
- `validateSession()` handles expiry cleanup (lazy delete from STORY-012)

## Acceptance Criteria
- [ ] Unauthenticated users (no cookie): page renders (no redirect)
- [ ] Invalid/expired session: page renders (no redirect, validateSession returns null)
- [ ] Valid authenticated session: server redirect to /universe
- [ ] Page always renders `<SignInForm />` when not redirecting

## Definition of Done
- [ ] `src/app/signin/page.tsx` created with traceability comments
- [ ] **Cannot be marked `done` independently; promote with TASK-014-004 tests passing**

---

**END TASK-014-002**
