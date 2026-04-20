# TASK-011-002 — AuthService: signIn() + stubs for validateSession() / signOut()

## Parent Story
STORY-011 — Sign-In API with Session Creation and Rate Limiting

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create the `AuthService` module at `src/modules/auth/auth.service.ts`. Implement `signIn()` fully. Add `validateSession()` and `signOut()` as stubs — these are completed in STORY-012 and STORY-013 respectively. `AuthService` is the shared auth layer reused by STORY-012 and STORY-013.

## Traceability
- ADR-011: bcrypt.compare; session cookie; no sliding window; lastActivityAt set at creation only; constant-time unknown-email path
- RFC-002: user_sessions schema (sessionId, userId, expiresAt, ipAddress, userAgent, lastActivityAt)
- PRD §9A: 7-day sessions; generic error message for all failure cases

## File
`src/modules/auth/auth.service.ts` — CREATED

## signIn() Logic (ordered)

```
1. isRateLimited(email) → if true, return { status: 'rate-limited' }
2. prisma.user.findUnique({ where: { email: normalizedEmail } })
3. If user not found:
     bcrypt.compare(password, DUMMY_HASH)  ← constant-time protection
     recordFailedAttempt(email)
     return { status: 'invalid-credentials' }
4. bcrypt.compare(password, user.passwordHash)
5. If bcrypt fails OR user.isActive === false:
     recordFailedAttempt(email)
     return { status: 'invalid-credentials' }
6. Success path:
     resetRateLimit(email)
     create UserSession: { userId, expiresAt: now+7d, ipAddress?, userAgent? }
     (lastActivityAt auto-set by DB default = createdAt; never updated per ADR-011)
     prisma.user.update lastLoginAt = now
     return { status: 'success', sessionId, userId, email }
```

**DUMMY_HASH** — a valid bcrypt hash used for constant-time unknown-email protection:
```typescript
// Pre-computed valid bcrypt hash (rounds=10). Value must be a real bcrypt output so that
// bcrypt.compare performs full key-derivation work (~100ms), preventing timing-based
// email enumeration. The plaintext it was derived from is irrelevant.
const DUMMY_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
```
This is a real bcrypt hash (not a placeholder). Do NOT replace with a non-bcrypt string — `bcrypt.compare` exits fast on invalid hash format, destroying constant-time protection.

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-002: AuthService — signIn() fully implemented; validateSession() and signOut() stubs
// ADR-011: bcrypt; no sliding window; constant-time unknown-email; in-memory rate limiter
// RFC-002: user_sessions schema

import bcrypt from 'bcrypt';
import { prisma } from '@/infrastructure/database/prisma';
import { isRateLimited, recordFailedAttempt, resetRateLimit } from './rate-limiter';

// Pre-computed bcrypt hash for constant-time unknown-email protection (ADR-011).
const DUMMY_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type SignInResult =
  | { status: 'rate-limited' }
  | { status: 'invalid-credentials' }
  | { status: 'success'; sessionId: string; userId: string; email: string };

export async function signIn(
  email: string,
  password: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<SignInResult> {
  const normalizedEmail = email.toLowerCase().trim();

  if (isRateLimited(normalizedEmail)) {
    return { status: 'rate-limited' };
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // constant-time
    recordFailedAttempt(normalizedEmail);
    return { status: 'invalid-credentials' };
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch || !user.isActive) {
    recordFailedAttempt(normalizedEmail);
    return { status: 'invalid-credentials' };
  }

  resetRateLimit(normalizedEmail);

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await prisma.userSession.create({
    data: { userId: user.userId, expiresAt, ipAddress, userAgent },
  });

  await prisma.user.update({
    where: { userId: user.userId },
    data: { lastLoginAt: new Date() },
  });

  return { status: 'success', sessionId: session.sessionId, userId: user.userId, email: user.email };
}

// STORY-012 will implement validateSession() — stub returns null until then.
// The null return is intentional: middleware treats null as "unauthenticated" (safe default).
export async function validateSession(_sessionId: string): Promise<null> {
  console.warn('[STUB] validateSession() called before STORY-012 implementation — returning null');
  return null;
}

// STORY-013 will implement signOut() — stub is a no-op until then.
export async function signOut(_sessionId: string): Promise<void> {
  console.warn('[STUB] signOut() called before STORY-013 implementation — no-op');
  return;
}
```

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| isActive checked AFTER bcrypt | Prevents timing difference between "wrong password" and "inactive user" paths |
| DUMMY_HASH is a valid bcrypt string | `bcrypt.compare` performs real work only on valid hashes; sentinel prevents fast-path exit |
| lastActivityAt not set explicitly | DB default `@default(now())` sets it equal to `createdAt`; never updated (ADR-011: no sliding window) |
| normalizedEmail used for rate limit key | Prevents bypassing rate limit by changing email case |
| validateSession returns null | Safe stub: STORY-012 middleware handles null as "unauthenticated"; no crash |
| signOut is a no-op | Safe stub: STORY-013 replaces it; no session deletion until then |

## Acceptance Criteria
- [ ] `signIn()` returns `{ status: 'rate-limited' }` when `isRateLimited` is true (no DB query)
- [ ] `signIn()` calls `bcrypt.compare` against DUMMY_HASH for unknown email
- [ ] `signIn()` returns `{ status: 'invalid-credentials' }` for wrong password
- [ ] `signIn()` returns `{ status: 'invalid-credentials' }` for inactive user
- [ ] `signIn()` returns `{ status: 'success', sessionId, userId, email }` on valid credentials
- [ ] `signIn()` creates `user_sessions` row with `expiresAt = now + 7 days`
- [ ] `signIn()` updates `users.lastLoginAt` on success
- [ ] `signIn()` resets rate limit counter on success
- [ ] `validateSession()` returns null (stub)
- [ ] `signOut()` returns void (stub)
- [ ] Traceability comments in source

## Definition of Done
- [ ] `src/modules/auth/auth.service.ts` created
- [ ] All three exports: signIn, validateSession, signOut
- [ ] **Cannot be marked `done` independently; promote to `done` with TASK-011-004 unit tests passing**

---

**END TASK-011-002**
