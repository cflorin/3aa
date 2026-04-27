// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-007: Unit tests — shouldRecompute() change detection
// EPIC-008/STORY-094/TASK-094-004: EPIC-008 trigger conditions

import { shouldRecompute } from '../../../src/domain/valuation/should-recompute';
import type { PriorValuationState } from '../../../src/domain/valuation/should-recompute';
import type { ValuationInput } from '../../../src/domain/valuation/types';

// Minimal valid ValuationInput
function makeInput(override: Partial<ValuationInput>): ValuationInput {
  return {
    activeCode: '4AA',
    anchoredThresholds: [],
    tsrHurdles: [],
    ...override,
  };
}

function makePrior(override: Partial<PriorValuationState>): PriorValuationState {
  return {
    activeCode: '4AA',
    primaryMetric: 'forward_pe',
    currentMultiple: 18,
    adjustedTsrHurdle: 11.0,
    ...override,
  };
}

describe('EPIC-005/STORY-075/TASK-075-007: shouldRecompute()', () => {
  // ── First-time compute ────────────────────────────────────────────────────────

  describe('First-time compute', () => {
    it('priorState=null → true (first-time compute always runs)', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: 18 });
      expect(shouldRecompute(input, null)).toBe(true);
    });
  });

  // ── Active code changed ───────────────────────────────────────────────────────

  describe('Active code changed', () => {
    it('activeCode changed from 4AA to 4BA → true', () => {
      const input = makeInput({ activeCode: '4BA', forwardPe: 18 });
      const prior = makePrior({ activeCode: '4AA', primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('activeCode changed from 4AA to 6BA → true', () => {
      const input = makeInput({ activeCode: '6BA', evSales: 5 });
      const prior = makePrior({ activeCode: '4AA', primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('activeCode unchanged → not triggered solely by code check', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: 18 });
      const prior = makePrior({ activeCode: '4AA', primaryMetric: 'forward_pe', currentMultiple: 18 });
      expect(shouldRecompute(input, prior)).toBe(false);
    });
  });

  // ── Multiple changed ≥5% → recompute ─────────────────────────────────────────

  describe('Multiple changed ≥ 5%', () => {
    it('multiple changed clearly at 5.5% → true (well above 5% threshold)', () => {
      // Use 20 as prior, 21.1 as current: |21.1-20|/20 = 1.1/20 = 0.055 = 5.5% → true
      const input = makeInput({ activeCode: '4AA', forwardPe: 21.1 });
      const prior = makePrior({ currentMultiple: 20, primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('multiple changed > 5% → true', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: 20 });
      const prior = makePrior({ currentMultiple: 18, primaryMetric: 'forward_pe' });
      // relative change = |20-18|/18 = 0.111 = 11.1% ≥ 5% → true
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('multiple dropped > 5% → true', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: 15 });
      const prior = makePrior({ currentMultiple: 18, primaryMetric: 'forward_pe' });
      // relative change = |15-18|/18 = 0.167 = 16.7% → true
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('ev_sales multiple changed > 5% → true', () => {
      const input = makeInput({ activeCode: '6BA', evSales: 6.0 });
      const prior = makePrior({ activeCode: '6BA', primaryMetric: 'ev_sales', currentMultiple: 5.0 });
      // relative change = |6-5|/5 = 0.20 = 20% → true
      expect(shouldRecompute(input, prior)).toBe(true);
    });
  });

  // ── Multiple changed < 5% → no recompute ─────────────────────────────────────

  describe('Multiple changed < 5%', () => {
    it('multiple changed exactly 4% → false', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: 18.72 });
      // 4% of 18 = 0.72, so 18 + 0.72 = 18.72
      const prior = makePrior({ currentMultiple: 18, primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('multiple unchanged → false', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: 18 });
      const prior = makePrior({ currentMultiple: 18, primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('tiny change (0.1%) → false', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: 18.018 });
      const prior = makePrior({ currentMultiple: 18, primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('ev_sales changed 3% → false', () => {
      const input = makeInput({ activeCode: '6BA', evSales: 5.15 });
      const prior = makePrior({ activeCode: '6BA', primaryMetric: 'ev_sales', currentMultiple: 5.0 });
      // relative change = 0.15/5 = 0.03 = 3% → false
      expect(shouldRecompute(input, prior)).toBe(false);
    });
  });

  // ── No multiple → no recompute ────────────────────────────────────────────────

  describe('No multiple available', () => {
    it('currentMultiple null, prior null → false (both null, no change)', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: null });
      const prior = makePrior({ currentMultiple: null, primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('prior multiple null, current multiple present → true (null → non-null is a change)', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: 18 });
      const prior = makePrior({ currentMultiple: null, primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('current multiple null, prior multiple present → true (non-null → null is a change)', () => {
      const input = makeInput({ activeCode: '4AA', forwardPe: null });
      const prior = makePrior({ currentMultiple: 18, primaryMetric: 'forward_pe' });
      expect(shouldRecompute(input, prior)).toBe(true);
    });
  });

  // ── Primary metric changed (pre_op_lev flag toggled) ─────────────────────────

  describe('Primary metric changed', () => {
    it('preOperatingLeverageFlag toggled on B5 → primary metric changes, triggers recompute', () => {
      // Without flag: metric = forward_ev_ebit
      // With flag:    metric = ev_sales
      const input = makeInput({
        activeCode: '5AA',
        preOperatingLeverageFlag: true,
        evSales: 8,
      });
      const prior = makePrior({
        activeCode: '5AA',
        primaryMetric: 'forward_ev_ebit',
        currentMultiple: 15,
      });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('preOperatingLeverageFlag removed on B5 → primary metric changes back, triggers recompute', () => {
      const input = makeInput({
        activeCode: '5AA',
        preOperatingLeverageFlag: false,
        forwardEvEbit: 15,
      });
      const prior = makePrior({
        activeCode: '5AA',
        primaryMetric: 'ev_sales',
        currentMultiple: 8,
      });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('holdingCompanyFlag toggled on 3AA → primary metric changes', () => {
      // With flag: forward_operating_earnings_ex_excess_cash
      // Without:   forward_pe
      const input = makeInput({
        activeCode: '3AA',
        holdingCompanyFlag: true,
        forwardOperatingEarningsExExcessCash: 16,
      });
      const prior = makePrior({
        activeCode: '3AA',
        primaryMetric: 'forward_pe',
        currentMultiple: 14,
      });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('same code, same metric, same multiple → false', () => {
      const input = makeInput({
        activeCode: '5AA',
        preOperatingLeverageFlag: false,
        forwardEvEbit: 15,
      });
      const prior = makePrior({
        activeCode: '5AA',
        primaryMetric: 'forward_ev_ebit',
        currentMultiple: 15,
      });
      expect(shouldRecompute(input, prior)).toBe(false);
    });
  });

  // ── Bucket 8 / no_stable_metric ──────────────────────────────────────────────

  describe('Bucket 8 / no_stable_metric', () => {
    it('8AA → priorState null → true', () => {
      const input = makeInput({ activeCode: '8AA' });
      expect(shouldRecompute(input, null)).toBe(true);
    });

    it('8AA unchanged → false (metric=no_stable_metric, multiple=null, same)', () => {
      const input = makeInput({ activeCode: '8AA' });
      const prior = makePrior({
        activeCode: '8AA',
        primaryMetric: 'no_stable_metric',
        currentMultiple: null,
      });
      expect(shouldRecompute(input, prior)).toBe(false);
    });
  });

  // ── STORY-082: Confidence-based demotion changes expected metric ──────────────

  describe('Confidence-based demotion (STORY-082)', () => {
    it('B6 low confidence: expected metric = forward_ev_ebit (demoted from ev_sales) → triggers recompute when prior has ev_sales', () => {
      // Prior stored before demotion was introduced: primaryMetric = 'ev_sales'
      const input = makeInput({ activeCode: '6BA', confidenceLevel: 'low', forwardEvEbit: 22.1, evSales: 9.7 });
      const prior = makePrior({ activeCode: '6BA', primaryMetric: 'ev_sales', currentMultiple: 9.7 });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('B6 low confidence: no recompute when prior already has forward_ev_ebit', () => {
      const input = makeInput({ activeCode: '6BA', confidenceLevel: 'low', forwardEvEbit: 22.1 });
      const prior = makePrior({ activeCode: '6BA', primaryMetric: 'forward_ev_ebit', currentMultiple: 22.1 });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('B5 low confidence: expected metric = forward_pe (demoted from forward_ev_ebit) → triggers recompute', () => {
      const input = makeInput({ activeCode: '5AA', confidenceLevel: 'low', forwardPe: 18.0, forwardEvEbit: 15.0 });
      const prior = makePrior({ activeCode: '5AA', primaryMetric: 'forward_ev_ebit', currentMultiple: 15.0 });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('B6 high confidence: expected metric = ev_sales (no demotion) → no recompute when prior matches', () => {
      const input = makeInput({ activeCode: '6BA', confidenceLevel: 'high', evSales: 9.7 });
      const prior = makePrior({ activeCode: '6BA', primaryMetric: 'ev_sales', currentMultiple: 9.7 });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('B1 low confidence: floor holds — metric stays forward_pe, no spurious recompute', () => {
      const input = makeInput({ activeCode: '1AA', confidenceLevel: 'low', forwardPe: 8.0 });
      const prior = makePrior({ activeCode: '1AA', primaryMetric: 'forward_pe', currentMultiple: 8.0 });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('B8 low confidence: exempt — no demotion, metric stays no_stable_metric', () => {
      const input = makeInput({ activeCode: '8AA', confidenceLevel: 'low' });
      const prior = makePrior({ activeCode: '8AA', primaryMetric: 'no_stable_metric', currentMultiple: null });
      expect(shouldRecompute(input, prior)).toBe(false);
    });
  });

  // ── primaryMetricOverride changes ─────────────────────────────────────────────

  describe('primaryMetricOverride changes', () => {
    it('override added → metric changes → recompute', () => {
      const input = makeInput({
        activeCode: '4AA',
        primaryMetricOverride: 'ev_sales',
        evSales: 8,
      });
      const prior = makePrior({
        primaryMetric: 'forward_pe',
        currentMultiple: 18,
      });
      expect(shouldRecompute(input, prior)).toBe(true);
    });
  });

  // ── EPIC-008/STORY-094: New trigger conditions ────────────────────────────────

  describe('EPIC-008 triggers (cyclicality_score, cycle_position, operating_margin, regime)', () => {
    function makeEpic8Input(override: Partial<ValuationInput>): ValuationInput {
      return makeInput({
        activeCode: '3AA',
        forwardPe: 30,
        structuralCyclicalityScore: 1,
        cyclePosition: 'normal' as const,
        operatingMarginTtm: 0.25,
        valuationRegime: 'profitable_growth_pe',
        ...override,
      });
    }

    function makeEpic8Prior(override: Partial<PriorValuationState>): PriorValuationState {
      return makePrior({
        activeCode: '3AA',
        primaryMetric: 'forward_pe',
        currentMultiple: 30,
        valuationRegime: 'profitable_growth_pe',
        structuralCyclicalityScoreSnapshot: 1,
        cyclePositionSnapshot: 'normal',
        operatingMarginSnapshot: 0.25,
        ...override,
      });
    }

    it('cyclicality score changed → true', () => {
      const input = makeEpic8Input({ structuralCyclicalityScore: 2 });
      const prior = makeEpic8Prior({ structuralCyclicalityScoreSnapshot: 1 });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('cyclicality score unchanged → not triggered', () => {
      const input = makeEpic8Input({ structuralCyclicalityScore: 1 });
      const prior = makeEpic8Prior({ structuralCyclicalityScoreSnapshot: 1 });
      // Only these epic-8 fields match; multiple also unchanged
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('cycle position changed → true', () => {
      const input = makeEpic8Input({ cyclePosition: 'elevated' as const });
      const prior = makeEpic8Prior({ cyclePositionSnapshot: 'normal' });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('cycle position unchanged → not triggered', () => {
      const input = makeEpic8Input({ cyclePosition: 'normal' as const });
      const prior = makeEpic8Prior({ cyclePositionSnapshot: 'normal' });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('operating margin changed by ≥5pp → true', () => {
      const input = makeEpic8Input({ operatingMarginTtm: 0.31 });  // changed by 0.06 ≥ 0.05
      const prior = makeEpic8Prior({ operatingMarginSnapshot: 0.25 });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('operating margin changed by <5pp → not triggered', () => {
      const input = makeEpic8Input({ operatingMarginTtm: 0.28 });  // changed by 0.03 < 0.05
      const prior = makeEpic8Prior({ operatingMarginSnapshot: 0.25 });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('valuation regime changed → true', () => {
      const input = makeEpic8Input({ valuationRegime: 'cyclical_earnings' });
      const prior = makeEpic8Prior({ valuationRegime: 'profitable_growth_pe' });
      expect(shouldRecompute(input, prior)).toBe(true);
    });

    it('valuation regime unchanged → not triggered', () => {
      const input = makeEpic8Input({ valuationRegime: 'profitable_growth_pe' });
      const prior = makeEpic8Prior({ valuationRegime: 'profitable_growth_pe' });
      expect(shouldRecompute(input, prior)).toBe(false);
    });

    it('EPIC-008 triggers do not fire when prior state has no valuationRegime field (legacy prior)', () => {
      // Legacy prior (no valuationRegime field set) — EPIC-008 triggers should not fire
      const input = makeEpic8Input({ structuralCyclicalityScore: 3, cyclePosition: 'peak' as const });
      const prior = makePrior({
        activeCode: '3AA',
        primaryMetric: 'forward_pe',
        currentMultiple: 30,
        // no valuationRegime — undefined, not set
      });
      expect(shouldRecompute(input, prior)).toBe(false);
    });
  });
});
