// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-082: Confidence-Based Valuation Metric Demotion
// TASK-082-006: Unit tests — domain demotion (Scenarios 1–6 + bucket-8 guard)

import { computeValuation, deriveEffectiveCode } from '../../../src/domain/valuation/compute-valuation';
import type { ValuationInput, AnchoredThresholdRow, TsrHurdleRow } from '../../../src/domain/valuation/types';

// ── Shared fixtures (subset of seeded anchors sufficient for demotion tests) ──

const ANCHORED_THRESHOLDS: AnchoredThresholdRow[] = [
  { code: '1AA', bucket: 1, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',      maxThreshold: 10.0, comfortableThreshold: 8.5,  veryGoodThreshold: 7.0,  stealThreshold: 5.5  },
  { code: '2AA', bucket: 2, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',      maxThreshold: 16.0, comfortableThreshold: 14.0, veryGoodThreshold: 12.5, stealThreshold: 11.0 },
  { code: '3BA', bucket: 3, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',      maxThreshold: 15.0, comfortableThreshold: 13.5, veryGoodThreshold: 12.0, stealThreshold: 10.5 },
  { code: '4AA', bucket: 4, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',      maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0 },
  { code: '4BA', bucket: 4, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',      maxThreshold: 14.5, comfortableThreshold: 13.0, veryGoodThreshold: 11.5, stealThreshold: 10.0 },
  { code: '5AA', bucket: 5, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit', maxThreshold: 20.0, comfortableThreshold: 17.0, veryGoodThreshold: 14.5, stealThreshold: 12.0 },
  { code: '5BA', bucket: 5, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit', maxThreshold: 17.0, comfortableThreshold: 15.0, veryGoodThreshold: 13.0, stealThreshold: 11.0 },
  { code: '5CB', bucket: 5, earningsQuality: 'C', balanceSheetQuality: 'B', primaryMetric: 'forward_ev_ebit', maxThreshold: 13.0, comfortableThreshold: 11.0, veryGoodThreshold: 9.5,  stealThreshold: 8.0  },
  { code: '6AA', bucket: 6, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',        maxThreshold: 12.0, comfortableThreshold: 10.0, veryGoodThreshold: 8.0,  stealThreshold: 6.0  },
  { code: '6BA', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',        maxThreshold: 9.0,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
  { code: '6CB', bucket: 6, earningsQuality: 'C', balanceSheetQuality: 'B', primaryMetric: 'ev_sales',        maxThreshold: 6.5,  comfortableThreshold: 5.0,  veryGoodThreshold: 4.0,  stealThreshold: 2.5  },
  { code: '7AA', bucket: 7, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',        maxThreshold: 18.0, comfortableThreshold: 15.0, veryGoodThreshold: 11.0, stealThreshold: 8.0  },
];

const TSR_HURDLES: TsrHurdleRow[] = [
  { bucket: 1, baseHurdleLabel: '14-16%+', baseHurdleDefault: 15.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 2, baseHurdleLabel: '10-11%',  baseHurdleDefault: 10.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 3, baseHurdleLabel: '11-12%',  baseHurdleDefault: 11.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 4, baseHurdleLabel: '12-13%',  baseHurdleDefault: 12.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 5, baseHurdleLabel: '14-16%',  baseHurdleDefault: 15.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 6, baseHurdleLabel: '18-20%+', baseHurdleDefault: 19.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 7, baseHurdleLabel: '25%+',    baseHurdleDefault: 25.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 8, baseHurdleLabel: 'No normal hurdle', baseHurdleDefault: null, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
];

function makeInput(override: Partial<ValuationInput>): ValuationInput {
  return {
    activeCode: '6BA',
    anchoredThresholds: ANCHORED_THRESHOLDS,
    tsrHurdles: TSR_HURDLES,
    ...override,
  };
}

// ── deriveEffectiveCode (pure helper) ─────────────────────────────────────────

describe('EPIC-005/STORY-082: deriveEffectiveCode()', () => {
  it('low confidence demotes bucket by 1', () => {
    expect(deriveEffectiveCode('6BA', 'low')).toBe('5BA');
  });

  it('preserves EQ and BS grade characters on demotion', () => {
    expect(deriveEffectiveCode('6CB', 'low')).toBe('5CB');
  });

  it('medium confidence: no demotion', () => {
    expect(deriveEffectiveCode('6BA', 'medium')).toBe('6BA');
  });

  it('high confidence: no demotion', () => {
    expect(deriveEffectiveCode('6BA', 'high')).toBe('6BA');
  });

  it('null confidence: no demotion', () => {
    expect(deriveEffectiveCode('6BA', null)).toBe('6BA');
  });

  it('undefined confidence: no demotion', () => {
    expect(deriveEffectiveCode('6BA', undefined)).toBe('6BA');
  });

  it('floor: bucket 1 with low confidence stays bucket 1', () => {
    expect(deriveEffectiveCode('1AA', 'low')).toBe('1AA');
  });

  it('bucket 8 with low confidence stays bucket 8 (exempt)', () => {
    expect(deriveEffectiveCode('8AA', 'low')).toBe('8AA');
  });

  it('bucket 5 low → bucket 4', () => {
    expect(deriveEffectiveCode('5AA', 'low')).toBe('4AA');
  });

  it('bucket 7 low → bucket 6', () => {
    expect(deriveEffectiveCode('7AA', 'low')).toBe('6AA');
  });
});

// ── computeValuation with confidence demotion ─────────────────────────────────

describe('EPIC-005/STORY-082: computeValuation() confidence-based demotion', () => {

  // Scenario 1: B6 low confidence → B5 metric (EV/EBIT)
  it('Scenario 1 — B6 low confidence demotes to B5: uses EV/EBIT and 5BA thresholds', () => {
    const result = computeValuation(makeInput({
      activeCode: '6BA',
      confidenceLevel: 'low',
      forwardEvEbit: 14.0,
    }));
    expect(result.effectiveCode).toBe('5BA');
    expect(result.activeCode).toBe('6BA');          // original preserved
    expect(result.primaryMetric).toBe('forward_ev_ebit');
    expect(result.maxThreshold).toBe(17.0);         // 5BA anchor, not 6BA (9.0)
    expect(result.currentMultiple).toBe(14.0);
  });

  // Scenario 2: B5 low confidence → B4 metric (Fwd P/E)
  it('Scenario 2 — B5 low confidence demotes to B4: uses Fwd P/E', () => {
    const result = computeValuation(makeInput({
      activeCode: '5AA',
      confidenceLevel: 'low',
      forwardPe: 20.0,
    }));
    expect(result.effectiveCode).toBe('4AA');
    expect(result.activeCode).toBe('5AA');
    expect(result.primaryMetric).toBe('forward_pe');
    expect(result.maxThreshold).toBe(22.0);         // 4AA anchor
  });

  // Scenario 3: Medium confidence — no demotion
  it('Scenario 3 — medium confidence: no demotion, uses EV/Sales', () => {
    const result = computeValuation(makeInput({
      activeCode: '6BA',
      confidenceLevel: 'medium',
      evSales: 5.0,
    }));
    expect(result.effectiveCode).toBe('6BA');
    expect(result.primaryMetric).toBe('ev_sales');
    expect(result.maxThreshold).toBe(9.0);          // 6BA anchor
  });

  // Scenario 4: Floor — bucket 1 low confidence stays bucket 1
  it('Scenario 4 — bucket 1 low confidence: floor holds, no demotion', () => {
    const result = computeValuation(makeInput({
      activeCode: '1AA',
      confidenceLevel: 'low',
      forwardPe: 7.0,
    }));
    expect(result.effectiveCode).toBe('1AA');
    expect(result.primaryMetric).toBe('forward_pe');
  });

  // Scenario 5: EQ and BS grades preserved on demotion
  it('Scenario 5 — grades preserved: 6CB low → 5CB', () => {
    const result = computeValuation(makeInput({
      activeCode: '6CB',
      confidenceLevel: 'low',
      forwardEvEbit: 10.0,
    }));
    expect(result.effectiveCode).toBe('5CB');
    expect(result.activeCode).toBe('6CB');
    expect(result.primaryMetric).toBe('forward_ev_ebit');
  });

  // Scenario 6: Null confidence — no demotion
  it('Scenario 6 — null confidence: no demotion', () => {
    const result = computeValuation(makeInput({
      activeCode: '6BA',
      confidenceLevel: null,
      evSales: 5.0,
    }));
    expect(result.effectiveCode).toBe('6BA');
    expect(result.primaryMetric).toBe('ev_sales');
  });

  // Bucket-8 guard (from self-validate)
  it('Bucket 8 with low confidence: no demotion, remains not_applicable', () => {
    const result = computeValuation(makeInput({
      activeCode: '8AA',
      confidenceLevel: 'low',
    }));
    expect(result.effectiveCode).toBe('8AA');
    expect(result.primaryMetric).toBe('no_stable_metric');
    expect(result.valuationZone).toBe('not_applicable');
  });

  // activeCode always preserved regardless of confidence
  it('activeCode is always the original classification code in the result', () => {
    const inputs: Array<[string, 'high' | 'medium' | 'low' | null]> = [
      ['6BA', 'low'], ['5AA', 'low'], ['4AA', 'high'], ['3BA', 'medium'],
    ];
    for (const [code, conf] of inputs) {
      const result = computeValuation(makeInput({ activeCode: code, confidenceLevel: conf, forwardPe: 15.0, evSales: 5.0, forwardEvEbit: 12.0 }));
      expect(result.activeCode).toBe(code);
    }
  });

  // No confidenceLevel provided (omitted) — backward-compatible, no demotion
  it('No confidenceLevel in input: no demotion (backward compatible)', () => {
    const result = computeValuation(makeInput({
      activeCode: '6BA',
      evSales: 5.0,
      // confidenceLevel deliberately omitted
    }));
    expect(result.effectiveCode).toBe('6BA');
    expect(result.primaryMetric).toBe('ev_sales');
  });
});
