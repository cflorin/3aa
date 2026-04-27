// EPIC-008: Valuation Regime Decoupling
// STORY-091: CyclicalScoreService
// TASK-091-005: Unit tests — golden-set + conservative bias invariant

import {
  computeStructuralCyclicalityScore,
  applyLlmCyclicalityModifier,
  computeCyclePosition,
  computeCyclicalConfidence,
  type QuarterlyHistoryRow,
  type DerivedMetricsRow,
} from '../../../src/domain/valuation/cyclical-score';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeHistory(
  revenuePattern: number[],
  opMarginPattern: number[],
  grossMarginPattern: number[],
): QuarterlyHistoryRow[] {
  const len = Math.max(revenuePattern.length, opMarginPattern.length, grossMarginPattern.length);
  return Array.from({ length: len }, (_, i) => ({
    revenue: revenuePattern[i] ?? null,
    operatingMargin: opMarginPattern[i] ?? null,
    grossMargin: grossMarginPattern[i] ?? null,
  }));
}

// Stable SaaS profile: flat revenues, stable margins, 12 quarters
const SAAS_HISTORY = makeHistory(
  Array(12).fill(1_000_000_000),
  Array(12).fill(0.25),
  Array(12).fill(0.75),
);

// Semiconductor profile: cyclical revenue swings, wide margin swings, 12 quarters
const SEMI_HISTORY = makeHistory(
  [1.0, 1.3, 1.7, 1.9, 1.5, 1.0, 0.8, 0.7, 1.0, 1.4, 1.8, 2.0].map((x) => x * 1_000_000_000),
  [0.10, 0.20, 0.35, 0.40, 0.30, 0.15, 0.05, 0.02, 0.12, 0.25, 0.38, 0.42],
  [0.45, 0.50, 0.60, 0.65, 0.55, 0.45, 0.38, 0.35, 0.45, 0.55, 0.62, 0.67],
);

// Energy profile: extreme volatility, 12 quarters
const ENERGY_HISTORY = makeHistory(
  [2.0, 2.5, 3.0, 1.5, 0.8, 0.5, 0.6, 1.2, 2.0, 2.8, 3.2, 1.0].map((x) => x * 1_000_000_000),
  [0.30, 0.35, 0.40, 0.15, -0.05, -0.10, 0.02, 0.20, 0.32, 0.38, 0.42, 0.10],
  [0.50, 0.55, 0.60, 0.35, 0.15, 0.10, 0.18, 0.38, 0.50, 0.58, 0.62, 0.28],
);

// ── computeStructuralCyclicalityScore ────────────────────────────────────────

describe('EPIC-008/STORY-091: computeStructuralCyclicalityScore()', () => {
  test('stable SaaS profile → score 0 (no volatility triggers)', () => {
    const score = computeStructuralCyclicalityScore(SAAS_HISTORY);
    expect(score).toBe(0);
  });

  test('semiconductor profile → score ≥ 2 (multiple triggers)', () => {
    const score = computeStructuralCyclicalityScore(SEMI_HISTORY);
    expect(score).toBeGreaterThanOrEqual(2);
  });

  test('energy profile → score 3 (all triggers fire)', () => {
    const score = computeStructuralCyclicalityScore(ENERGY_HISTORY);
    expect(score).toBe(3);
  });

  test('< 8 quarters → score 0 regardless of volatility', () => {
    const shortHistory = SEMI_HISTORY.slice(0, 5);
    const score = computeStructuralCyclicalityScore(shortHistory);
    expect(score).toBe(0);
  });

  test('exactly 8 quarters → scoring applies', () => {
    const exactHistory = SEMI_HISTORY.slice(0, 8);
    const score = computeStructuralCyclicalityScore(exactHistory);
    expect(score).toBeGreaterThan(0);
  });

  test('score never exceeds 3', () => {
    const score = computeStructuralCyclicalityScore(ENERGY_HISTORY);
    expect(score).toBeLessThanOrEqual(3);
  });

  test('score never below 0', () => {
    const score = computeStructuralCyclicalityScore(SAAS_HISTORY);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test('null revenue values handled gracefully', () => {
    const historyWithNulls = SAAS_HISTORY.map((q) => ({ ...q, revenue: null }));
    expect(() => computeStructuralCyclicalityScore(historyWithNulls)).not.toThrow();
  });
});

// ── applyLlmCyclicalityModifier ───────────────────────────────────────────────

describe('EPIC-008/STORY-091: applyLlmCyclicalityModifier()', () => {
  test('high quality (combined >= 4.0) → score reduced by 1', () => {
    const result = applyLlmCyclicalityModifier(2, { marginDurabilityScore: 4.5, pricingPowerScore: 4.5 });
    expect(result).toBe(1);
  });

  test('low quality (combined <= 2.0) → score raised by 1', () => {
    const result = applyLlmCyclicalityModifier(2, { marginDurabilityScore: 1.5, pricingPowerScore: 1.5 });
    expect(result).toBe(3);
  });

  test('mid quality (between 2 and 4) → no change', () => {
    const result = applyLlmCyclicalityModifier(2, { marginDurabilityScore: 3.0, pricingPowerScore: 3.0 });
    expect(result).toBe(2);
  });

  test('null scores → no change (skip modifier)', () => {
    const result = applyLlmCyclicalityModifier(2, null);
    expect(result).toBe(2);
  });

  test('one null score → no change', () => {
    const result = applyLlmCyclicalityModifier(2, { marginDurabilityScore: null, pricingPowerScore: 4.5 });
    expect(result).toBe(2);
  });

  test('modifier clamped to [0, 3] — no negative result', () => {
    const result = applyLlmCyclicalityModifier(0, { marginDurabilityScore: 5.0, pricingPowerScore: 5.0 });
    expect(result).toBe(0);
  });

  test('modifier clamped to [0, 3] — no result above 3', () => {
    const result = applyLlmCyclicalityModifier(3, { marginDurabilityScore: 1.0, pricingPowerScore: 1.0 });
    expect(result).toBe(3);
  });

  test('exactly 4.0 combined → reduce by 1', () => {
    const result = applyLlmCyclicalityModifier(2, { marginDurabilityScore: 4.0, pricingPowerScore: 4.0 });
    expect(result).toBe(1);
  });

  test('exactly 2.0 combined → raise by 1', () => {
    const result = applyLlmCyclicalityModifier(2, { marginDurabilityScore: 2.0, pricingPowerScore: 2.0 });
    expect(result).toBe(3);
  });
});

// ── computeCyclePosition ─────────────────────────────────────────────────────

describe('EPIC-008/STORY-091: computeCyclePosition()', () => {
  // Semi history avg op margin ≈ mean of [0.10, 0.20, 0.35, 0.40, 0.30, 0.15, 0.05, 0.02, 0.12, 0.25, 0.38, 0.42]
  // ≈ 0.228

  const histAvgRev = mean(
    [1.0, 1.3, 1.7, 1.9, 1.5, 1.0, 0.8, 0.7, 1.0, 1.4, 1.8, 2.0].map((x) => x * 1_000_000_000),
  );
  const histHighRev = 2.0 * 1_000_000_000;

  function makeDerived(opMarginTtm: number | null, revenueTtm: number | null): DerivedMetricsRow {
    return { operatingMarginTtm: opMarginTtm, revenueTtm, quartersAvailable: 12 };
  }

  test('peak: margin ≥ 1.25× avg AND revenue ≥ historical high → peak', () => {
    // avg ≈ 0.228, 1.25× ≈ 0.285; use 0.30 margin, revenue = histHighRev
    const result = computeCyclePosition(SEMI_HISTORY, makeDerived(0.30, histHighRev));
    expect(result).toBe('peak');
  });

  test('elevated: margin ≥ 1.15× avg AND revenue > midpoint, but < peak conditions', () => {
    // avg ≈ 0.228, 1.15× ≈ 0.262; revenue above midpoint but below high
    const result = computeCyclePosition(SEMI_HISTORY, makeDerived(0.27, histAvgRev * 1.1));
    expect(result).toBe('elevated');
  });

  test('CONSERVATIVE BIAS: margin ≥ 1.15× avg but revenue NOT above midpoint → normal', () => {
    // Only margin condition fires — revenue below midpoint → must return normal, not elevated
    const lowRevenue = histAvgRev * 0.5; // well below midpoint
    const result = computeCyclePosition(SEMI_HISTORY, makeDerived(0.27, lowRevenue));
    expect(result).toBe('normal');
  });

  test('CONSERVATIVE BIAS: margin alone elevated but revenue null → normal (not elevated/peak)', () => {
    const result = computeCyclePosition(SEMI_HISTORY, makeDerived(0.30, null));
    expect(result).toBe('normal');
  });

  test('depressed: margin < 0.85× avg → depressed', () => {
    // avg ≈ 0.228, 0.85× ≈ 0.194; use 0.10
    const result = computeCyclePosition(SEMI_HISTORY, makeDerived(0.10, histAvgRev));
    expect(result).toBe('depressed');
  });

  test('normal: margin within bands → normal', () => {
    // avg ≈ 0.228; use 0.22 (close to avg, within both bands)
    const result = computeCyclePosition(SEMI_HISTORY, makeDerived(0.22, histAvgRev));
    expect(result).toBe('normal');
  });

  test('< 8 quarters → insufficient_data', () => {
    const shortHistory = SEMI_HISTORY.slice(0, 5);
    const result = computeCyclePosition(shortHistory, makeDerived(0.30, histHighRev));
    expect(result).toBe('insufficient_data');
  });

  test('null derivedMetrics → normal (conservative default)', () => {
    const result = computeCyclePosition(SEMI_HISTORY, null);
    expect(result).toBe('normal');
  });

  test('null ttmOpMargin → normal (conservative default)', () => {
    const result = computeCyclePosition(SEMI_HISTORY, makeDerived(null, histHighRev));
    expect(result).toBe('normal');
  });

  test('stable SaaS history → normal (no cyclicality signals)', () => {
    const avgRev = 1_000_000_000;
    const result = computeCyclePosition(SAAS_HISTORY, { operatingMarginTtm: 0.25, revenueTtm: avgRev, quartersAvailable: 12 });
    expect(result).toBe('normal');
  });

  test('CONSERVATIVE BIAS: margin ≥ 1.25× but revenue slightly below high → not peak (check elevated path)', () => {
    // Peak condition: revenue >= histHighRev; if revenue just below high, should not be 'peak'
    const slightlyBelowHigh = histHighRev * 0.99;
    const result = computeCyclePosition(SEMI_HISTORY, makeDerived(0.30, slightlyBelowHigh));
    // Should be elevated (margin condition fires for elevated) or normal, never peak
    expect(result).not.toBe('peak');
  });
});

// ── computeCyclicalConfidence ─────────────────────────────────────────────────

describe('EPIC-008/STORY-091: computeCyclicalConfidence()', () => {
  test('< 8 quarters → insufficient_data', () => {
    expect(computeCyclicalConfidence(5, 2, 2)).toBe('insufficient_data');
  });

  test('exactly 8 quarters, signal clear → medium (not high — need ≥ 12)', () => {
    expect(computeCyclicalConfidence(8, 2, 2)).toBe('medium');
  });

  test('>= 12 quarters, signal clear (no LLM conflict) → high', () => {
    expect(computeCyclicalConfidence(12, 2, 2)).toBe('high');
  });

  test('>= 12 quarters, signal NOT clear (LLM modified score) → medium', () => {
    expect(computeCyclicalConfidence(12, 1, 2)).toBe('medium');
  });

  test('8 quarters, LLM conflict → medium', () => {
    expect(computeCyclicalConfidence(8, 1, 2)).toBe('medium');
  });
});

// ── Helper for test fixture ───────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}
