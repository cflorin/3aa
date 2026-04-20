# TASK-011-001 — In-Memory Rate Limiter

## Parent Story
STORY-011 — Sign-In API with Session Creation and Rate Limiting

## Epic
EPIC-002 — Authentication & User Management

## Objective
Create the in-memory per-email rate limiter at `src/modules/auth/rate-limiter.ts`. Tracks failed sign-in attempts per email within a sliding 15-minute window. Returns true when a request is allowed, false when the limit is exceeded. Counter resets on successful sign-in.

## Traceability
- ADR-011: In-memory rate limiting; per-email; 5 failed attempts per 15-minute window; acceptable for V1 small user base

## File
`src/modules/auth/rate-limiter.ts` — CREATED

## Implementation

```typescript
// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-001: In-memory per-email rate limiter
// ADR-011: 5 failed attempts per 15-minute window; in-memory acceptable for V1

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// Module-level Map — survives across requests within a single Cloud Run instance.
// Multi-instance state divergence is acceptable per ADR-011 (small admin user base).
const store = new Map<string, RateLimitEntry>();

export function isRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = store.get(email);
  if (!entry || now - entry.windowStart > WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(email: string): void {
  const now = Date.now();
  const entry = store.get(email);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(email, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
}

export function resetRateLimit(email: string): void {
  store.delete(email);
}

// Test helper — clears all entries. Only called in test suites to reset state between tests.
export function clearAll(): void {
  store.clear();
}
```

## Behaviour Contract
| Call | State change |
|------|-------------|
| `isRateLimited(email)` | Read-only; true if count ≥ 5 within window |
| `recordFailedAttempt(email)` | Increments count; starts new window if expired |
| `resetRateLimit(email)` | Deletes entry; next failed attempt starts fresh window |

## Key Constraints
- Rate limit checked BEFORE any DB query (enforced by AuthService call order)
- Window is fixed (not sliding per attempt): first failure sets `windowStart`; window expires `windowStart + 15min`
- After window expiry, next call to either `isRateLimited` or `recordFailedAttempt` treats it as a new window
- `store` is module-scoped; isolated per Cloud Run instance (acceptable per ADR-011)

## Acceptance Criteria
- [ ] `isRateLimited` returns false for a fresh email
- [ ] After 5 `recordFailedAttempt` calls, `isRateLimited` returns true
- [ ] After window expiry (simulated), `isRateLimited` returns false again
- [ ] `resetRateLimit` clears the count; subsequent `isRateLimited` returns false
- [ ] Two different emails have independent counters
- [ ] `isRateLimited` is read-only (no side effects)

## Definition of Done
- [ ] `src/modules/auth/rate-limiter.ts` created with traceability comments
- [ ] Exports: `isRateLimited`, `recordFailedAttempt`, `resetRateLimit`, `clearAll`
- [ ] **Cannot be marked `done` independently; promote to `done` with TASK-011-004 unit tests passing**

---

**END TASK-011-001**
