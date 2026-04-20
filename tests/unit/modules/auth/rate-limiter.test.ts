// EPIC-002: Authentication & User Management
// STORY-011: Sign-In API with Session Creation and Rate Limiting
// TASK-011-004: Unit tests — in-memory rate limiter
// ADR-011: 5 attempts per 15-minute window; per-email counters

import {
  isRateLimited,
  recordFailedAttempt,
  resetRateLimit,
  clearAll,
} from '@/modules/auth/rate-limiter';

describe('EPIC-002/STORY-011/TASK-011-004: rate limiter', () => {
  beforeEach(() => clearAll());

  it('isRateLimited returns false for a fresh email', () => {
    expect(isRateLimited('alice@example.com')).toBe(false);
  });

  it('isRateLimited returns false after 4 failed attempts', () => {
    for (let i = 0; i < 4; i++) recordFailedAttempt('alice@example.com');
    expect(isRateLimited('alice@example.com')).toBe(false);
  });

  it('isRateLimited returns true after 5 failed attempts within window', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt('alice@example.com');
    expect(isRateLimited('alice@example.com')).toBe(true);
  });

  it('isRateLimited returns false after window has expired', () => {
    const realNow = Date.now;
    try {
      // Record 5 failures at t=0
      Date.now = () => 0;
      for (let i = 0; i < 5; i++) recordFailedAttempt('alice@example.com');
      expect(isRateLimited('alice@example.com')).toBe(true);

      // Advance past window
      Date.now = () => 15 * 60 * 1000 + 1;
      expect(isRateLimited('alice@example.com')).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  it('resetRateLimit clears the counter; isRateLimited returns false', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt('alice@example.com');
    expect(isRateLimited('alice@example.com')).toBe(true);
    resetRateLimit('alice@example.com');
    expect(isRateLimited('alice@example.com')).toBe(false);
  });

  it('two different emails have independent counters', () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt('alice@example.com');
    expect(isRateLimited('alice@example.com')).toBe(true);
    expect(isRateLimited('bob@example.com')).toBe(false);
  });

  it('isRateLimited is read-only: calling it does not change count', () => {
    for (let i = 0; i < 4; i++) recordFailedAttempt('alice@example.com');
    isRateLimited('alice@example.com');
    isRateLimited('alice@example.com');
    expect(isRateLimited('alice@example.com')).toBe(false);
    recordFailedAttempt('alice@example.com');
    expect(isRateLimited('alice@example.com')).toBe(true);
  });

  it('recordFailedAttempt in expired window starts a new window from count=1', () => {
    const realNow = Date.now;
    try {
      Date.now = () => 0;
      for (let i = 0; i < 5; i++) recordFailedAttempt('alice@example.com');

      // Advance past window, then record one more failure
      Date.now = () => 15 * 60 * 1000 + 1;
      recordFailedAttempt('alice@example.com');

      // Count should be 1, not 6 — not blocked yet
      expect(isRateLimited('alice@example.com')).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });
});
