# TASK-012-002 — Next.js Middleware (src/middleware.ts)

## Parent Story
STORY-012 — Session Validation Middleware and Route Protection

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create `src/middleware.ts` to intercept all protected-route requests, validate the session cookie via `validateSession()`, and either forward the request with `x-user-id`/`x-user-email` headers injected or redirect to `/signin` with the cookie cleared.

## Traceability
- ADR-011: Node.js runtime required (Prisma); `sessionId` cookie; no sliding window; middleware pattern
- ADR-007: `x-user-id` header injection for per-user data isolation in downstream Server Components and API routes
- PRD §9A: route protection, redirect unauthenticated to /signin, inject user identity

## File
`src/middleware.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-002: Next.js middleware — session validation, header injection, redirect
// ADR-011: Node.js runtime (Prisma requires it); sessionId cookie; no lastActivityAt update
// ADR-007: x-user-id header injection for user isolation in server-side code

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateSession } from '@/modules/auth/auth.service';

// Prisma is not compatible with Edge runtime — force Node.js runtime
export const runtime = 'nodejs';

export async function middleware(req: NextRequest) {
  const sessionId = req.cookies.get('sessionId')?.value;

  if (!sessionId) {
    return NextResponse.redirect(new URL('/signin', req.url));
  }

  const user = await validateSession(sessionId);

  if (!user) {
    const response = NextResponse.redirect(new URL('/signin', req.url));
    // Clear stale/invalid cookie so browser doesn't keep sending it
    response.cookies.delete('sessionId');
    return response;
  }

  // Overwrite (not append) x-user-id and x-user-email to prevent client spoofing (ADR-007)
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-id', user.userId);
  requestHeaders.set('x-user-email', user.email);

  // ADR-011: never log sessionId value or user email — userId only for audit trail
  console.log(`[STORY-012] session valid: userId=${user.userId}`);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    // Protect all routes except: /signin, /api/auth/*, /api/health, /api/cron/*, /api/admin/*, /_next/*, /favicon.ico
    // /api/auth/* excluded: sign-in endpoint called by unauthenticated users (no session cookie yet)
    '/((?!signin|api/auth|api/health|api/cron|api/admin|_next|favicon\\.ico).*)',
  ],
};
```

## Matcher Exclusions — Verified Paths

| Path | Excluded? | Reason |
|------|-----------|--------|
| `/signin` | ✓ | Auth page — no session to validate; STORY-014 handles redirect-if-authenticated |
| `/api/health` | ✓ | Health check is unauthenticated by design |
| `/api/cron/price-sync` | ✓ | OIDC auth (STORY-007), not session cookie |
| `/api/cron/classify` | ✓ | Same |
| `/api/cron/valuate` | ✓ | Same |
| `/api/cron/generate-alerts` | ✓ | Same |
| `/api/cron/cleanup-sessions` | ✓ | Same |
| `/api/cron/snapshot` | ✓ | Same |
| `/api/admin/users` | ✓ | API key auth (STORY-010) |
| `/api/admin/users/[id]/password` | ✓ | Same |
| `/api/admin/users/[id]/active` | ✓ | Same |
| `/_next/static/...` | ✓ | Next.js static assets |
| `/_next/image/...` | ✓ | Next.js image optimization |
| `/favicon.ico` | ✓ | Static asset |
| `/` (root) | Protected | Application home page |
| `/dashboard` | Protected | Example protected page |
| `/api/auth/signin` | ✓ | Sign-in endpoint called by unauthenticated users — excluded via `api/auth` prefix |

## Key Constraints
- `export const runtime = 'nodejs'` is mandatory — Prisma requires Node.js runtime
- `requestHeaders.set(...)` **overwrites** the header (prevents client-supplied x-user-id spoofing)
- Middleware does NOT redirect already-authenticated users visiting `/signin` — that is STORY-014's concern
- Middleware does NOT update `lastActivityAt` — no sliding window (ADR-011)
- Cookie is cleared on invalid session (client stops sending stale cookie on next request)
- Cookie is NOT cleared when there is no cookie (nothing to clear)

## Acceptance Criteria
- [ ] No cookie → 302 redirect to /signin, no x-user-id set
- [ ] Invalid/expired session → 302 redirect to /signin, sessionId cookie deleted
- [ ] Valid session → request forwarded, x-user-id and x-user-email set
- [ ] Client-supplied x-user-id header is overwritten by middleware value
- [ ] Matcher excludes /signin, /api/auth/*, /api/health, /api/cron/*, /api/admin/*, /_next/*, /favicon.ico
- [ ] runtime = 'nodejs' exported

## Definition of Done
- [ ] `src/middleware.ts` created with traceability comments
- [ ] `export const runtime = 'nodejs'` present
- [ ] Matcher config excludes all routes listed above
- [ ] **Cannot be marked `done` independently; promote with TASK-012-004 unit tests passing**

---

**END TASK-012-002**
