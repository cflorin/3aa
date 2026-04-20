# TASK-013-001 — AuthService.signOut() Implementation

## Parent Story
STORY-013 — Sign-Out API and Expired Session Cleanup

## Epic
EPIC-002 — Authentication & User Management

## Objective
Replace the `signOut()` stub in `src/modules/auth/auth.service.ts` with a full implementation that deletes the session row identified by `sessionId`. Must be idempotent (no error if session not found).

## Traceability
- ADR-011: session deleted immediately on sign-out; idempotent sign-out (missing session → no error)
- PRD §9A: sign-out invalidates session immediately

## File
`src/modules/auth/auth.service.ts` — MODIFIED (replace stub)

## Implementation

Replace:
```typescript
export async function signOut(_sessionId: string): Promise<void> {
  console.warn('[STUB] signOut() called before STORY-013 implementation — no-op');
}
```

With:
```typescript
// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-001: signOut() — replaces STORY-011 stub; idempotent session deletion
// ADR-011: session deleted immediately on sign-out; deleteMany is idempotent (no P2025)
export async function signOut(sessionId: string): Promise<void> {
  // deleteMany is idempotent: no error if sessionId not found (unlike prisma.delete which throws P2025)
  await prisma.userSession.deleteMany({ where: { sessionId } });
}
```

## Why deleteMany (not delete)
`prisma.userSession.delete()` throws `PrismaClientKnownRequestError` P2025 if the record does not exist.
`prisma.userSession.deleteMany()` is idempotent — zero deletions is not an error.
Sign-out must always succeed (even if the session was already deleted by another sign-out or cleanup job).

## Acceptance Criteria
- [ ] Calls `prisma.userSession.deleteMany({ where: { sessionId } })` with the exact sessionId passed in
- [ ] Returns void without throwing even if no row was found
- [ ] Does NOT call `prisma.userSession.delete()` (would throw P2025 on missing row)

## Definition of Done
- [ ] Stub removed; full implementation in place with traceability comments
- [ ] **Cannot be marked `done` independently; promote with TASK-013-005 unit tests passing**

---

**END TASK-013-001**
