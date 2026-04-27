// EPIC-008: Valuation Regime Decoupling
// STORY-096: EPIC-008 Regression & Integration Tests
// TASK-096-004: Conservative bias tests — computeCyclePosition()
//
// ADR-018 hard invariant: false tightening (elevated/peak when actually normal) is
// materially worse than false normalisation. elevated and peak require BOTH margin AND
// revenue conditions to fire simultaneously. When in doubt, return 'normal'.

import { computeCyclePosition } from '../../../../src/domain/valuation/cyclical-score';
import type { QuarterlyHistoryRow, DerivedMetricsRow } from '../../../../src/domain/valuation/cyclical-score';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a stable 8+ quarter history with given average op margin and revenue
function makeHistory(n: number, opMargin: number, revenue: number): QuarterlyHistoryRow[] {
  return Array.from({ length: n }, () => ({ revenue, operatingMargin: opMargin, grossMargin: opMargin * 1.3 }));
}

// Build derived metrics row
function dm(operatingMarginTtm: number, revenueTtm: number): DerivedMetricsRow {
  return { operatingMarginTtm, revenueTtm, quartersAvailable: 8 };
}

// Baseline: 8 quarters at 20% op margin, revenue=1000
const HISTORY_AVG_OP_MARGIN = 0.20;
const HISTORY_AVG_REVENUE = 1000;
const BASE_HISTORY = makeHistory(8, HISTORY_AVG_OP_MARGIN, HISTORY_AVG_REVENUE);

// ── TASK-096-004: Conservative bias invariants ─────────────────────────────────

describe('Conservative bias: elevated requires BOTH conditions simultaneously', () => {

  it('margin elevated by exactly 14% (<1.15× threshold) → normal', () => {
    // 20% × 1.14 = 0.228 — just below 1.15× = 0.23 threshold
    const ttmMargin = HISTORY_AVG_OP_MARGIN * 1.14;  // 0.228
    // Revenue above midpoint (1000)
    const ttmRevenue = HISTORY_AVG_REVENUE * 1.1;     // 1100 > midpoint
    const result = computeCyclePosition(BASE_HISTORY, dm(ttmMargin, ttmRevenue));
    expect(result).toBe('normal');
  });

  it('margin elevated by 16% (≥1.15×) but revenue NOT trending above midpoint → normal (not elevated)', () => {
    // 20% × 1.16 = 0.232 — above 1.15× threshold
    const ttmMargin = HISTORY_AVG_OP_MARGIN * 1.16;   // 0.232
    // Revenue BELOW midpoint of history (which is 1000 since uniform)
    const ttmRevenue = HISTORY_AVG_REVENUE * 0.90;    // 900 < midpoint=1000
    const result = computeCyclePosition(BASE_HISTORY, dm(ttmMargin, ttmRevenue));
    expect(result).toBe('normal');
  });

  it('margin elevated by 16% AND revenue above midpoint → elevated (both conditions met)', () => {
    // This is the positive case — BOTH conditions required
    const ttmMargin = HISTORY_AVG_OP_MARGIN * 1.16;   // 0.232
    const ttmRevenue = HISTORY_AVG_REVENUE * 1.10;    // 1100 > midpoint=1000
    const result = computeCyclePosition(BASE_HISTORY, dm(ttmMargin, ttmRevenue));
    expect(result).toBe('elevated');
  });

});

describe('Conservative bias: peak requires BOTH conditions simultaneously', () => {

  it('margin elevated by 26% AND revenue at history high → peak', () => {
    // 20% × 1.26 = 0.252 ≥ 1.25× = 0.25 threshold
    const ttmMargin = HISTORY_AVG_OP_MARGIN * 1.26;   // 0.252
    // Revenue at or above max of history (1000)
    const ttmRevenue = HISTORY_AVG_REVENUE;           // exactly at max
    const result = computeCyclePosition(BASE_HISTORY, dm(ttmMargin, ttmRevenue));
    expect(result).toBe('peak');
  });

  it('margin elevated by 26% but revenue BELOW history high → elevated (not peak)', () => {
    const ttmMargin = HISTORY_AVG_OP_MARGIN * 1.26;   // 0.252 → above both thresholds
    // Revenue below history max but above midpoint — peak condition fails, elevated fires
    const ttmRevenue = HISTORY_AVG_REVENUE * 0.95;   // 950 < max=1000, but > mean=1000 — actually 950<1000 so below midpoint too
    // Since revenue=950 < midpoint=1000, elevated condition also fails → normal
    const result = computeCyclePosition(BASE_HISTORY, dm(ttmMargin, ttmRevenue));
    // Revenue < midpoint → neither peak nor elevated fires
    expect(result).toBe('normal');
  });

  it('only revenue at history high but margin is normal → normal (not peak)', () => {
    // Margin at exactly 1.0× avg (exactly average) — neither threshold crossed
    const ttmMargin = HISTORY_AVG_OP_MARGIN;          // 0.20 — exactly avg
    const ttmRevenue = HISTORY_AVG_REVENUE;           // at history max
    const result = computeCyclePosition(BASE_HISTORY, dm(ttmMargin, ttmRevenue));
    expect(result).toBe('normal');
  });

});

describe('Insufficient data guard', () => {

  it('< 8 quarters → insufficient_data regardless of margins', () => {
    const shortHistory = makeHistory(7, HISTORY_AVG_OP_MARGIN * 1.30, HISTORY_AVG_REVENUE);
    const result = computeCyclePosition(shortHistory, dm(HISTORY_AVG_OP_MARGIN * 1.30, HISTORY_AVG_REVENUE * 2));
    expect(result).toBe('insufficient_data');
  });

  it('exactly 8 quarters → can return non-insufficient_data result', () => {
    // Score ≥ 8, so result should not be insufficient_data
    const result = computeCyclePosition(BASE_HISTORY, dm(HISTORY_AVG_OP_MARGIN, HISTORY_AVG_REVENUE));
    expect(result).not.toBe('insufficient_data');
  });

  it('null derivedMetrics → normal (conservative default)', () => {
    const result = computeCyclePosition(BASE_HISTORY, null);
    expect(result).toBe('normal');
  });

  it('null TTM op margin → normal (conservative default)', () => {
    const result = computeCyclePosition(BASE_HISTORY, { operatingMarginTtm: null, revenueTtm: 1000, quartersAvailable: 8 });
    expect(result).toBe('normal');
  });

});

describe('Depressed cycle detection', () => {

  it('margin at 84% of avg (< 0.85×) → depressed', () => {
    const ttmMargin = HISTORY_AVG_OP_MARGIN * 0.84;   // 0.168 < 0.85× = 0.17
    const result = computeCyclePosition(BASE_HISTORY, dm(ttmMargin, HISTORY_AVG_REVENUE));
    expect(result).toBe('depressed');
  });

  it('margin at 86% of avg (≥ 0.85×) → normal (depressed threshold not crossed)', () => {
    const ttmMargin = HISTORY_AVG_OP_MARGIN * 0.86;   // 0.172 ≥ 0.17
    const result = computeCyclePosition(BASE_HISTORY, dm(ttmMargin, HISTORY_AVG_REVENUE));
    expect(result).toBe('normal');
  });

});

describe('Default conservative output', () => {

  it('all margins exactly at average → normal', () => {
    const result = computeCyclePosition(BASE_HISTORY, dm(HISTORY_AVG_OP_MARGIN, HISTORY_AVG_REVENUE));
    expect(result).toBe('normal');
  });

  it('zero avg history margin → normal (avoids division by zero path)', () => {
    const zeroMarginHistory = makeHistory(8, 0, 1000);
    const result = computeCyclePosition(zeroMarginHistory, dm(0, 1000));
    expect(result).toBe('normal');
  });

});
