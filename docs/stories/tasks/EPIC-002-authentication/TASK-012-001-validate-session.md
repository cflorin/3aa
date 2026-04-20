# TASK-012-001 — validateSession() Implementation

## Parent Story
STORY-012 — Session Validation Middleware and Route Protection

## Epic
EPIC-002 — Authentication & User Management

## Objective
Replace the `validateSession()` stub in `src/modules/auth/auth.service.ts` with a full implementation that queries `user_sessions`, checks expiry, deletes expired rows (lazy cleanup), checks `user.isActive`, and returns `{ userId, email }` or `null`.

## Traceability
- ADR-011: 7-day fixed session; no sliding window (`lastActivityAt` never updated here); lazy cleanup on access
- PRD §9A: Session validation — expired or missing → unauthenticated; inactive user → unauthenticated

## File
`src/modules/auth/auth.service.ts` — MODIFIED (replace stub)

## Return Type Change
The stub's return type `Promise<null>` becomes `Promise<{ userId: string; email: string } | null>`.
Exporting a minimal type (not the full Prisma User) keeps the public API clean.

## Implementation

Replace:
```typescript
export async function validateSession(_sessionId: string): Promise<null> {
  console.warn('[STUB] validateSession() called before STORY-012 implementation — returning null');
  return null;
}
```

With:
```typescript
// STORY-012: replaces STORY-011 stub; ADR-011: lazy expiry cleanup, no sliding window
export async function validateSession(
  sessionId: string,
): Promise<{ userId: string; email: string } | null> {
  const session = await prisma.userSession.findUnique({
    where: { sessionId },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    // Lazy cleanup — delete expired row so it doesn't accumulate (ADR-011)
    await prisma.userSession.delete({ where: { sessionId } });
    return null;
  }

  // Inactive user: session row survives (admin can reactivate), but access is denied
  if (!session.user.isActive) return null;

  return { userId: session.user.userId, email: session.user.email };
}
```

## Traceability Comments to Retain
```typescript
// EPIC-002: Authentication & User Management
// STORY-012: Session Validation Middleware and Route Protection
// TASK-012-001: validateSession() — replaces STORY-011 stub
// ADR-011: lazy expiry cleanup; no sliding window (lastActivityAt never touched here)
// PRD §9A: expired or missing session → null; inactive user → null
```

## Behaviour Contract
| Input | Behaviour | Return |
|-------|-----------|--------|
| Unknown sessionId | No delete | `null` |
| Valid, active session | No delete | `{ userId, email }` |
| Expired session | Delete session row | `null` |
| Valid session, user.isActive=false | No delete | `null` |

## Key Constraints
- `prisma.userSession.delete` called **only** on expired sessions, never on unknown or inactive-user sessions
- `lastActivityAt` is **never** updated here — no sliding window (ADR-011)
- Return type is `{ userId, email }` — does NOT return the full Prisma User record

## Acceptance Criteria
- [ ] Returns null for unknown sessionId (no DB write)
- [ ] Returns `{ userId, email }` for valid session
- [ ] Returns null for expired session; `user_sessions` row deleted
- [ ] Returns null for inactive user; `user_sessions` row NOT deleted
- [ ] `lastActivityAt` field never written

## Definition of Done
- [ ] Stub removed from `src/modules/auth/auth.service.ts`; full implementation in place
- [ ] Return type updated in source
- [ ] **Cannot be marked `done` independently; promote with TASK-012-004 unit tests and TASK-012-005 integration tests passing**

---

**END TASK-012-001**
