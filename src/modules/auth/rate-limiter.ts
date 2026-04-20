// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-001: In-memory per-email rate limiter
// ADR-011: 5 failed attempts per 15-minute window; in-memory acceptable for V1 (small admin-controlled user base)

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// Module-level Map survives across requests within a single Cloud Run instance.
// Multi-instance state divergence is a known V1 limitation per ADR-011.
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

// Clears all entries. Called in test suites to isolate state between tests.
export function clearAll(): void {
  store.clear();
}
