# TASK-012-003 — getCurrentUser() Helper (src/lib/auth.ts)

## Parent Story
STORY-012 — Session Validation Middleware and Route Protection

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create `src/lib/auth.ts` with the `getCurrentUser()` function that reads the `x-user-id` and `x-user-email` headers injected by middleware and returns `{ userId, email }` or `null`. This is the canonical way for Server Components and API route handlers to access the authenticated user's identity.

## Traceability
- ADR-007: User identity available to all server-side code via x-user-id header injection
- PRD §9A: Server Components and API routes read user identity from injected headers

## File
`src/lib/auth.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-003: getCurrentUser() — reads x-user-id/x-user-email injected by middleware
// ADR-007: user identity propagated via headers; only valid on protected routes (after middleware ran)
// PRD §9A: Server Components and protected API routes call this to get authenticated user

import { headers } from 'next/headers';

// Returns the authenticated user from middleware-injected headers.
// Only valid in Server Components and route handlers that are protected by middleware.
// Returns null if headers are absent (middleware did not run, or path is excluded from matcher).
export function getCurrentUser(): { userId: string; email: string } | null {
  const h = headers();
  const userId = h.get('x-user-id');
  const email = h.get('x-user-email');
  if (!userId || !email) return null;
  return { userId, email };
}
```

## Behaviour Contract

| Headers present | Return value |
|----------------|-------------|
| Both `x-user-id` and `x-user-email` set | `{ userId, email }` |
| `x-user-id` missing | `null` |
| `x-user-email` missing | `null` |
| Both missing (excluded route or no middleware) | `null` |

## Key Constraints
- `headers()` from `next/headers` is synchronous in Next.js 14.2.21 (NOT a Promise — do not `await` it; test mocks must return a plain object with `.get()`, not a Promise)
- `getCurrentUser()` is therefore synchronous (no `async`/`await`)
- This function is a **protected-route helper only** — it is only meaningful after middleware has run
- NOT a universal auth primitive — do not call on excluded routes expecting a valid user
- `/signin` Server Component (STORY-014) does NOT use `getCurrentUser()`; it reads the cookie directly via `cookies()` and calls `validateSession()` instead

## Acceptance Criteria
- [ ] Returns `{ userId, email }` when both headers are present
- [ ] Returns `null` when `x-user-id` is absent
- [ ] Returns `null` when `x-user-email` is absent
- [ ] Returns `null` when both headers are absent

## Definition of Done
- [ ] `src/lib/auth.ts` created with traceability comments
- [ ] Exports `getCurrentUser()` only (no other exports needed in STORY-012)
- [ ] **Cannot be marked `done` independently; promote with TASK-012-004 unit tests passing**

---

**END TASK-012-003**
