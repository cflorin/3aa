// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-007: Unit tests — shouldRecompute() change detection

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
});
