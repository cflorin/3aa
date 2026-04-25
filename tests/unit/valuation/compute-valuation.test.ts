// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-007: Unit tests — computeValuation() orchestrator golden-set

import { computeValuation } from '../../../src/domain/valuation/compute-valuation';
import type { ValuationInput, AnchoredThresholdRow, TsrHurdleRow } from '../../../src/domain/valuation/types';

// ── Full seeded anchored thresholds (all 16 rows from prisma/seed.ts) ────────
const ANCHORED_THRESHOLDS: AnchoredThresholdRow[] = [
  { code: '1AA', bucket: 1, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 10.0, comfortableThreshold: 8.5,  veryGoodThreshold: 7.0,  stealThreshold: 5.5  },
  { code: '1BA', bucket: 1, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 8.5,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
  { code: '2AA', bucket: 2, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 16.0, comfortableThreshold: 14.0, veryGoodThreshold: 12.5, stealThreshold: 11.0 },
  { code: '2BA', bucket: 2, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 13.5, comfortableThreshold: 12.0, veryGoodThreshold: 10.5, stealThreshold: 9.0  },
  { code: '3AA', bucket: 3, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_operating_earnings_ex_excess_cash', maxThreshold: 18.5, comfortableThreshold: 17.0, veryGoodThreshold: 15.5, stealThreshold: 14.0 },
  { code: '3BA', bucket: 3, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 15.0, comfortableThreshold: 13.5, veryGoodThreshold: 12.0, stealThreshold: 10.5 },
  { code: '4AA', bucket: 4, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0 },
  { code: '4BA', bucket: 4, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 14.5, comfortableThreshold: 13.0, veryGoodThreshold: 11.5, stealThreshold: 10.0 },
  { code: '5AA', bucket: 5, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 20.0, comfortableThreshold: 17.0, veryGoodThreshold: 14.5, stealThreshold: 12.0 },
  { code: '5BA', bucket: 5, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 17.0, comfortableThreshold: 15.0, veryGoodThreshold: 13.0, stealThreshold: 11.0 },
  { code: '5BB', bucket: 5, earningsQuality: 'B', balanceSheetQuality: 'B', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 15.0, comfortableThreshold: 13.0, veryGoodThreshold: 11.0, stealThreshold: 9.0  },
  { code: '6AA', bucket: 6, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 12.0, comfortableThreshold: 10.0, veryGoodThreshold: 8.0,  stealThreshold: 6.0  },
  { code: '6BA', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 9.0,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
  { code: '6BB', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'B', primaryMetric: 'ev_sales',                                 maxThreshold: 7.0,  comfortableThreshold: 5.5,  veryGoodThreshold: 4.5,  stealThreshold: 3.0  },
  { code: '7AA', bucket: 7, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 18.0, comfortableThreshold: 15.0, veryGoodThreshold: 11.0, stealThreshold: 8.0  },
  { code: '7BA', bucket: 7, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 14.0, comfortableThreshold: 11.0, veryGoodThreshold: 8.5,  stealThreshold: 6.0  },
];

const TSR_HURDLES: TsrHurdleRow[] = [
  { bucket: 1, baseHurdleLabel: '14-16%+',         baseHurdleDefault: 15.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 2, baseHurdleLabel: '10-11%',           baseHurdleDefault: 10.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 3, baseHurdleLabel: '11-12%',           baseHurdleDefault: 11.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 4, baseHurdleLabel: '12-13%',           baseHurdleDefault: 12.50, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 5, baseHurdleLabel: '14-16%',           baseHurdleDefault: 15.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 6, baseHurdleLabel: '18-20%+',          baseHurdleDefault: 19.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 7, baseHurdleLabel: '25%+',             baseHurdleDefault: 25.00, earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
  { bucket: 8, baseHurdleLabel: 'No normal hurdle', baseHurdleDefault: null,  earningsQualityAAdjustment: -1.0, earningsQualityBAdjustment: 0.0, earningsQualityCAdjustment: 2.5, balanceSheetAAdjustment: -0.5, balanceSheetBAdjustment: 0.0, balanceSheetCAdjustment: 1.75 },
];

function makeInput(override: Partial<ValuationInput>): ValuationInput {
  return {
    activeCode: '4AA',
    anchoredThresholds: ANCHORED_THRESHOLDS,
    tsrHurdles: TSR_HURDLES,
    ...override,
  };
}

describe('EPIC-005/STORY-075/TASK-075-007: computeValuation()', () => {
  // ── Golden-set for 4 anchored codes ──────────────────────────────────────────

  describe('Golden-set: 4AA — forward_pe=18 → very_good_zone', () => {
    it('zone=very_good_zone, status=ready, thresholdSource=anchored', () => {
      const result = computeValuation(makeInput({
        activeCode: '4AA',
        forwardPe: 18,
      }));
      // 4AA thresholds: max=22, comfortable=20, veryGood=18, steal=16
      // pe=18 → 16 < 18 <= 18 → very_good_zone
      expect(result.valuationZone).toBe('very_good_zone');
      expect(result.valuationStateStatus).toBe('ready');
      expect(result.thresholdSource).toBe('anchored');
      expect(result.primaryMetric).toBe('forward_pe');
      expect(result.currentMultiple).toBe(18);
      expect(result.currentMultipleBasis).toBe('spot');
      expect(result.maxThreshold).toBe(22.0);
      expect(result.comfortableThreshold).toBe(20.0);
      expect(result.veryGoodThreshold).toBe(18.0);
      expect(result.stealThreshold).toBe(16.0);
      expect(result.derivedFromCode).toBeNull();
      expect(result.grossMarginAdjustmentApplied).toBe(false);
      expect(result.dilutionAdjustmentApplied).toBe(false);
    });
  });

  describe('Golden-set: 6BA — ev_sales=4.5, grossMargin=0.75 → very_good_zone, grossMarginApplied=false', () => {
    it('grossMargin 60-80% range: no adjustment, very_good_zone', () => {
      const result = computeValuation(makeInput({
        activeCode: '6BA',
        evSales: 4.5,
        grossMargin: 0.75,
      }));
      // 6BA thresholds: max=9, comfortable=7, veryGood=5.5, steal=4
      // grossMargin 0.75 is in 60-80% → no adjustment
      // ev_sales=4.5: steal=4, 4 < 4.5 <= 5.5 → very_good_zone
      expect(result.valuationZone).toBe('very_good_zone');
      expect(result.grossMarginAdjustmentApplied).toBe(false);
      expect(result.primaryMetric).toBe('ev_sales');
      expect(result.currentMultiple).toBe(4.5);
      expect(result.thresholdSource).toBe('anchored');
    });
  });

  describe('Golden-set: 7BA — ev_sales=12, materialDilutionFlag=true → dilution applied, zone computed', () => {
    it('dilution applied: thresholds become 13/10/7.5/5; ev=12 → max_zone', () => {
      const result = computeValuation(makeInput({
        activeCode: '7BA',
        evSales: 12,
        materialDilutionFlag: true,
      }));
      // 7BA base: 14/11/8.5/6 → dilution -1.0x → 13/10/7.5/5
      // ev=12: 10 < 12 <= 13 → max_zone
      expect(result.dilutionAdjustmentApplied).toBe(true);
      expect(result.maxThreshold).toBe(13.0);
      expect(result.comfortableThreshold).toBe(10.0);
      expect(result.veryGoodThreshold).toBe(7.5);
      expect(result.stealThreshold).toBe(5.0);
      expect(result.valuationZone).toBe('max_zone');
      expect(result.valuationStateStatus).toBe('ready');
    });
  });

  describe('Golden-set: 3BA — forward_pe=null, cyclicalityFlag=true → manual_required', () => {
    it('status=manual_required when forward_pe missing and cyclical (no trailing fallback)', () => {
      const result = computeValuation(makeInput({
        activeCode: '3BA',
        forwardPe: null,
        cyclicalityFlag: true,
        trailingPe: 14,
        trailingEps: 2.5,
      }));
      expect(result.valuationStateStatus).toBe('manual_required');
      expect(result.valuationZone).toBe('not_applicable');
      expect(result.cyclicalityContextFlag).toBe(true);
      expect(result.primaryMetric).toBe('forward_pe');
    });
  });

  // ── B8 short-circuit ──────────────────────────────────────────────────────────

  describe('B8 short-circuit', () => {
    it('8AA: status=not_applicable, all thresholds null', () => {
      const result = computeValuation(makeInput({
        activeCode: '8AA',
        forwardPe: 10,
      }));
      expect(result.valuationStateStatus).toBe('not_applicable');
      expect(result.primaryMetric).toBe('no_stable_metric');
      expect(result.currentMultiple).toBeNull();
      expect(result.maxThreshold).toBeNull();
      expect(result.comfortableThreshold).toBeNull();
      expect(result.veryGoodThreshold).toBeNull();
      expect(result.stealThreshold).toBeNull();
      expect(result.adjustedTsrHurdle).toBeNull();
      expect(result.valuationZone).toBe('not_applicable');
    });
  });

  // ── Holding company 3AA with null earnings ───────────────────────────────────

  describe('Holding company 3AA with null earnings', () => {
    it('3AA + holdingCompanyFlag=true + no forwardOperatingEarnings → manual_required', () => {
      const result = computeValuation(makeInput({
        activeCode: '3AA',
        holdingCompanyFlag: true,
        forwardOperatingEarningsExExcessCash: null,
      }));
      expect(result.valuationStateStatus).toBe('manual_required');
      expect(result.primaryMetric).toBe('forward_operating_earnings_ex_excess_cash');
      expect(result.valuationZone).toBe('not_applicable');
    });

    it('3AA + holdingCompanyFlag=true + forwardOperatingEarnings provided → ready', () => {
      const result = computeValuation(makeInput({
        activeCode: '3AA',
        holdingCompanyFlag: true,
        forwardOperatingEarningsExExcessCash: 16,
      }));
      // 3AA thresholds: max=18.5, comfortable=17, veryGood=15.5, steal=14
      // multiple=16: 15.5 < 16 <= 17 → comfortable_zone
      expect(result.valuationStateStatus).toBe('ready');
      expect(result.primaryMetric).toBe('forward_operating_earnings_ex_excess_cash');
      expect(result.valuationZone).toBe('comfortable_zone');
    });
  });

  // ── Forward P/E fallback ──────────────────────────────────────────────────────

  describe('Forward P/E fallback to trailing', () => {
    it('forwardPe=null, trailingPe=20, trailingEps>0, cyclicality=false → uses trailing, basis=trailing_fallback', () => {
      const result = computeValuation(makeInput({
        activeCode: '4AA',
        forwardPe: null,
        trailingPe: 20,
        trailingEps: 5.0,
        cyclicalityFlag: false,
      }));
      // 4AA thresholds: max=22, comfortable=20, veryGood=18, steal=16
      // trailingPe=20: 18 < 20 <= 20 → comfortable_zone
      expect(result.currentMultiple).toBe(20);
      expect(result.currentMultipleBasis).toBe('trailing_fallback');
      expect(result.metricSource).toBe('fallback_trailing_pe');
      expect(result.valuationZone).toBe('comfortable_zone');
      expect(result.valuationStateStatus).toBe('ready');
    });

    it('forwardPe=null, trailingPe=0 → not used (trailingPe must be > 0)', () => {
      const result = computeValuation(makeInput({
        activeCode: '4AA',
        forwardPe: null,
        trailingPe: 0,
        cyclicalityFlag: false,
      }));
      expect(result.valuationStateStatus).toBe('manual_required');
    });

    it('forwardPe=null, trailingPe=null → manual_required', () => {
      const result = computeValuation(makeInput({
        activeCode: '4AA',
        forwardPe: null,
        trailingPe: null,
        cyclicalityFlag: false,
      }));
      expect(result.valuationStateStatus).toBe('manual_required');
    });
  });

  // ── Cyclicality blocks trailing fallback ─────────────────────────────────────

  describe('Cyclicality blocks trailing P/E fallback', () => {
    it('forwardPe=null, cyclicalityFlag=true → manual_required (no trailing fallback)', () => {
      const result = computeValuation(makeInput({
        activeCode: '4AA',
        forwardPe: null,
        trailingPe: 20,
        trailingEps: 5.0,
        cyclicalityFlag: true,
      }));
      expect(result.valuationStateStatus).toBe('manual_required');
      expect(result.cyclicalityContextFlag).toBe(true);
    });
  });

  // ── TSR hurdle is included in all results ────────────────────────────────────

  describe('TSR hurdle propagation', () => {
    it('4AA result includes correct adjustedTsrHurdle=11.0', () => {
      const result = computeValuation(makeInput({
        activeCode: '4AA',
        forwardPe: 18,
      }));
      expect(result.adjustedTsrHurdle).toBe(11.0);
      expect(result.baseTsrHurdleDefault).toBe(12.5);
      expect(result.hurdleSource).toBe('default');
    });

    it('6BA result includes correct adjustedTsrHurdle=18.5', () => {
      const result = computeValuation(makeInput({
        activeCode: '6BA',
        evSales: 5.0,
      }));
      expect(result.adjustedTsrHurdle).toBe(18.5);
    });
  });

  // ── activeCode is echoed in result ───────────────────────────────────────────

  describe('activeCode propagation', () => {
    const codes = ['1AA', '3BA', '5BB', '6BA', '7BA'];
    for (const code of codes) {
      it(`result.activeCode matches input.activeCode for ${code}`, () => {
        const result = computeValuation(makeInput({ activeCode: code, forwardPe: 10, evSales: 5, forwardEvEbit: 12 }));
        expect(result.activeCode).toBe(code);
      });
    }
  });

  // ── B5 ev_ebit (no preOpLev) ─────────────────────────────────────────────────

  describe('Bucket 5 ev_ebit', () => {
    it('5AA + forwardEvEbit=15 → ready, ev_ebit metric', () => {
      const result = computeValuation(makeInput({
        activeCode: '5AA',
        forwardEvEbit: 15,
      }));
      // 5AA thresholds: max=20, comfortable=17, veryGood=14.5, steal=12
      // ev_ebit=15: 14.5 < 15 <= 17 → comfortable_zone
      expect(result.primaryMetric).toBe('forward_ev_ebit');
      expect(result.currentMultiple).toBe(15);
      expect(result.valuationZone).toBe('comfortable_zone');
      expect(result.valuationStateStatus).toBe('ready');
    });
  });
});
