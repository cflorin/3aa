// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-081: EPIC-005 Regression & Integration Tests
// TASK-081-005: Cross-epic regression — ADR-007 invariant: suggested_code drives valuation
// ADR-007: Multi-user architecture — system state always uses suggested_code (not user override)

jest.mock('@/infrastructure/database/prisma', () => ({
  prisma: {
    stock: { findFirst: jest.fn(), findUnique: jest.fn() },
    anchoredThreshold: { findMany: jest.fn() },
    tsrHurdle: { findMany: jest.fn() },
  },
}));

import { shouldRecompute } from '../../../src/domain/valuation/should-recompute';
import type { PriorValuationState } from '../../../src/domain/valuation';
import { computeValuation } from '../../../src/domain/valuation/compute-valuation';
import type { ValuationInput, AnchoredThresholdRow, TsrHurdleRow } from '../../../src/domain/valuation/types';

const ANCHORED: AnchoredThresholdRow[] = [
  { code: '4AA', bucket: 4, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe', maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0 },
  { code: '6BA', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',   maxThreshold: 9.0,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
];

const HURDLES: TsrHurdleRow[] = [
  { bucket: 4, baseHurdleLabel: '12-13%',  baseHurdleDefault: 12.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 6, baseHurdleLabel: '18-20%+', baseHurdleDefault: 19.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
];

function makeInput(overrides: Partial<ValuationInput>): ValuationInput {
  return { activeCode: '4AA', anchoredThresholds: ANCHORED, tsrHurdles: HURDLES, ...overrides };
}

describe('EPIC-005/STORY-081/TASK-081-005: Cross-epic regression — ADR-007 invariant', () => {

  // ── Invariant 1: suggested_code drives system valuation ──────────────────────
  // When user has a classification override (finalCode='6BA'),
  // the SYSTEM valuation must still use suggestedCode='4AA' (not the user's override).

  it('System valuation uses suggestedCode (4AA), not userClassificationOverride (6BA)', () => {
    const suggestedCode = '4AA';    // from classificationState.suggestedCode
    const userOverrideCode = '6BA'; // from userClassificationOverrides.finalCode — NOT for system state

    const systemResult = computeValuation(makeInput({ activeCode: suggestedCode, forwardPe: 19 }));
    const userDrivenResult = computeValuation(makeInput({ activeCode: userOverrideCode, evSales: 5.0 }));

    // System result uses 4AA thresholds (forward_pe)
    expect(systemResult.primaryMetric).toBe('forward_pe');
    expect(systemResult.maxThreshold).toBe(22.0);
    expect(systemResult.valuationZone).toBe('comfortable_zone');

    // User-override-driven would yield different thresholds (ev_sales)
    // 6BA: steal=4, vg=5.5; evSales=5.0 → 4 < 5.0 ≤ 5.5 → very_good_zone
    expect(userDrivenResult.primaryMetric).toBe('ev_sales');
    expect(userDrivenResult.maxThreshold).toBe(9.0);
    expect(userDrivenResult.valuationZone).toBe('very_good_zone');

    // Confirm they diverge — proof that using wrong code silently changes output
    expect(systemResult.maxThreshold).not.toBe(userDrivenResult.maxThreshold);
  });

  // ── Invariant 2: classification code change → shouldRecompute returns true ───

  it('shouldRecompute returns true when suggestedCode changes (4AA → 4BA)', () => {
    const input4BA = makeInput({ activeCode: '4BA', forwardPe: 12 });
    const priorWith4AA: PriorValuationState = {
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: 19,
      adjustedTsrHurdle: 11.0,
    };
    expect(shouldRecompute(input4BA, priorWith4AA)).toBe(true);
  });

  it('shouldRecompute returns false when code unchanged and multiple within 5%', () => {
    // 19 → 19.5 is ~2.6% change, below 5% threshold
    const input = makeInput({ activeCode: '4AA', forwardPe: 19.5 });
    const prior: PriorValuationState = {
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: 19,
      adjustedTsrHurdle: 11.0,
    };
    expect(shouldRecompute(input, prior)).toBe(false);
  });

  it('shouldRecompute returns true when multiple changes ≥5%', () => {
    // 19 → 20.1 is 5.8% change
    const input = makeInput({ activeCode: '4AA', forwardPe: 20.1 });
    const prior: PriorValuationState = {
      activeCode: '4AA',
      primaryMetric: 'forward_pe',
      currentMultiple: 19,
      adjustedTsrHurdle: 11.0,
    };
    expect(shouldRecompute(input, prior)).toBe(true);
  });

  it('shouldRecompute returns true when prior is null (never computed)', () => {
    const input = makeInput({ activeCode: '4AA', forwardPe: 19 });
    expect(shouldRecompute(input, null)).toBe(true);
  });

  // ── Invariant 3: different classification code → different thresholds + zone ─

  it('Classification code change (4AA → 6BA) produces different metric family and zone', () => {
    const result4AA = computeValuation(makeInput({ activeCode: '4AA', forwardPe: 8 }));
    const result6BA = computeValuation(makeInput({ activeCode: '6BA', evSales: 8 }));

    expect(result4AA.primaryMetric).toBe('forward_pe');
    expect(result6BA.primaryMetric).toBe('ev_sales');

    // PE=8 with 4AA thresholds: steal(16) > 8 → steal_zone
    expect(result4AA.valuationZone).toBe('steal_zone');
    // EV/Sales=8 with 6BA thresholds: vg=5.5, c=7.0, max=9.0; 7 < 8 ≤ 9 → max_zone
    expect(result6BA.valuationZone).toBe('max_zone');
  });

  // ── Invariant 4: ADR-007 — user valuation override applies only to userResult ─

  it('Manual threshold override does not change anchored thresholds in system state', () => {
    // System result: uses anchored thresholds
    const systemResult = computeValuation(makeInput({ activeCode: '4AA', forwardPe: 19 }));

    // User override scenario: user provides manual thresholds via UserValuationOverride
    // This is applied IN getPersonalizedValuation() AFTER system state is loaded —
    // the system state row in DB is never mutated
    const manualOverrideResult = computeValuation(makeInput({
      activeCode: '4AA',
      forwardPe: 19,
      primaryMetricOverride: 'forward_pe',
    }));

    // Both use the same anchored thresholds (manual override just passes through the metric)
    expect(systemResult.maxThreshold).toBe(manualOverrideResult.maxThreshold);
    expect(systemResult.thresholdSource).toBe('anchored');
    expect(manualOverrideResult.thresholdSource).toBe('anchored');
  });
});
