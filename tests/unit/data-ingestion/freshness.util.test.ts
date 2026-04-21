// EPIC-003: Data Ingestion & Universe Management
// STORY-022: Data Freshness Tracking
// TASK-022-002: Unit tests for computeFreshnessStatus()
// RFC-004 §Data Freshness: threshold values and boundary rules

import { computeFreshnessStatus } from '@/modules/data-ingestion/freshness.util';
import type { FreshnessInput, FreshnessResult } from '@/modules/data-ingestion/freshness.util';

function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('EPIC-003/STORY-022/TASK-022-002: computeFreshnessStatus()', () => {
  const now = new Date('2026-04-20T12:00:00Z');

  // ── Price boundary tests ────────────────────────────────────────────────────

  describe('price freshness boundaries', () => {
    it('price 1 day old → fresh', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.price).toBe('fresh');
    });

    it('price exactly 2 days old → stale (age >= PRICE_FRESH_DAYS)', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(2, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.price).toBe('stale');
    });

    it('price 5 days old → stale (age <= PRICE_MISSING_DAYS)', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(5, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.price).toBe('stale');
    });

    it('price 6 days old → missing (age > PRICE_MISSING_DAYS)', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(6, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.price).toBe('missing');
    });

    it('price null → missing', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: null,
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.price).toBe('missing');
    });
  });

  // ── Fundamentals boundary tests ─────────────────────────────────────────────

  describe('fundamentals freshness boundaries', () => {
    it('fundamentals 89 days old → fresh', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(89, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.fundamentals).toBe('fresh');
    });

    it('fundamentals exactly 90 days old → stale (age >= FUND_FRESH_DAYS)', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(90, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.fundamentals).toBe('stale');
    });

    it('fundamentals 179 days old → stale (age <= FUND_MISSING_DAYS)', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(179, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.fundamentals).toBe('stale');
    });

    it('fundamentals 180 days old → missing (age > FUND_MISSING_DAYS)', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(180, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.fundamentals).toBe('missing');
    });

    it('fundamentals null → missing', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: null,
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.fundamentals).toBe('missing');
    });
  });

  // ── Estimates boundary tests (same thresholds as fundamentals) ──────────────

  describe('estimates freshness boundaries', () => {
    it('estimates 89 days old → fresh', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(89, now),
        now,
      });
      expect(result.estimates).toBe('fresh');
    });

    it('estimates 90 days old → stale', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(90, now),
        now,
      });
      expect(result.estimates).toBe('stale');
    });

    it('estimates 179 days old → stale', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(179, now),
        now,
      });
      expect(result.estimates).toBe('stale');
    });

    it('estimates 180 days old → missing', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(180, now),
        now,
      });
      expect(result.estimates).toBe('missing');
    });

    it('estimates null → missing', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: null,
        now,
      });
      expect(result.estimates).toBe('missing');
    });
  });

  // ── Overall rule tests ──────────────────────────────────────────────────────

  describe('overall freshness rule', () => {
    it('all three fresh → overall fresh', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.overall).toBe('fresh');
    });

    it('price stale, others fresh → overall stale', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(3, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.overall).toBe('stale');
    });

    it('fundamentals stale, others fresh → overall stale', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(100, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.overall).toBe('stale');
    });

    it('estimates stale, others fresh → overall stale', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(100, now),
        now,
      });
      expect(result.overall).toBe('stale');
    });

    it('price missing → overall missing (even if others are fresh)', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: null,
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.overall).toBe('missing');
    });

    it('fundamentals missing → overall missing', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: null,
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.overall).toBe('missing');
    });

    it('estimates missing → overall missing', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(1, now),
        fundamentals_last_updated_at: daysAgo(1, now),
        estimates_last_updated_at: null,
        now,
      });
      expect(result.overall).toBe('missing');
    });

    it('missing takes priority over stale in overall', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: daysAgo(3, now), // stale
        fundamentals_last_updated_at: null,      // missing
        estimates_last_updated_at: daysAgo(1, now),
        now,
      });
      expect(result.overall).toBe('missing');
    });

    it('all three null → all missing, overall missing', () => {
      const result = computeFreshnessStatus({
        price_last_updated_at: null,
        fundamentals_last_updated_at: null,
        estimates_last_updated_at: null,
        now,
      });
      expect(result.price).toBe('missing');
      expect(result.fundamentals).toBe('missing');
      expect(result.estimates).toBe('missing');
      expect(result.overall).toBe('missing');
    });
  });

  // ── now parameter tests ─────────────────────────────────────────────────────

  describe('injectable now parameter', () => {
    it('uses injected now for deterministic results', () => {
      const fixedNow = new Date('2026-04-20T00:00:00Z');
      const priceAt = new Date('2026-04-19T00:00:00Z'); // exactly 1 day ago → fresh
      const result = computeFreshnessStatus({
        price_last_updated_at: priceAt,
        fundamentals_last_updated_at: priceAt,
        estimates_last_updated_at: priceAt,
        now: fixedNow,
      });
      expect(result.price).toBe('fresh');
    });

    it('defaults to current time when now is not provided', () => {
      // Just verify it doesn't throw; exact values depend on current time
      const result = computeFreshnessStatus({
        price_last_updated_at: new Date(),
        fundamentals_last_updated_at: new Date(),
        estimates_last_updated_at: new Date(),
      });
      expect(['fresh', 'stale', 'missing']).toContain(result.overall);
    });
  });
});
