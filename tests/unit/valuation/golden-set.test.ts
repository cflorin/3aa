// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-081: EPIC-005 Regression & Integration Tests
// TASK-081-001: Golden-set regression — all 16 anchored codes + 10 derived codes
// Source: docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md

import { computeValuation } from '../../../src/domain/valuation/compute-valuation';
import type { ValuationInput, AnchoredThresholdRow, TsrHurdleRow } from '../../../src/domain/valuation/types';

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

function makeInput(overrides: Partial<ValuationInput>): ValuationInput {
  return { activeCode: '4AA', anchoredThresholds: ANCHORED_THRESHOLDS, tsrHurdles: TSR_HURDLES, ...overrides };
}

describe('EPIC-005/STORY-081/TASK-081-001: Golden-set regression', () => {

  // ── All 16 anchored codes — comfortable_zone at midpoint multiple ─────────────
  // Each code tested end-to-end through computeValuation() to catch wiring regressions
  // Representative multiple lands in comfortable_zone: veryGood < multiple ≤ comfortable

  describe('All 16 anchored codes — comfortable_zone at representative multiple', () => {
    const cases: Array<{ code: string; metric: 'forwardPe' | 'forwardEvEbit' | 'evSales'; multiple: number }> = [
      { code: '1AA', metric: 'forwardPe',    multiple: 8.0  },  // vg=7.0, c=8.5
      { code: '1BA', metric: 'forwardPe',    multiple: 6.5  },  // vg=5.5, c=7.0
      { code: '2AA', metric: 'forwardPe',    multiple: 13.5 },  // vg=12.5, c=14.0
      { code: '2BA', metric: 'forwardPe',    multiple: 11.5 },  // vg=10.5, c=12.0
      { code: '3AA', metric: 'forwardPe',    multiple: 16.5 },  // vg=15.5, c=17.0 (no holdingFlag → uses forward_pe)
      { code: '3BA', metric: 'forwardPe',    multiple: 12.5 },  // vg=12.0, c=13.5
      { code: '4AA', metric: 'forwardPe',    multiple: 19.0 },  // vg=18.0, c=20.0
      { code: '4BA', metric: 'forwardPe',    multiple: 12.5 },  // vg=11.5, c=13.0
      { code: '5AA', metric: 'forwardEvEbit', multiple: 16.0 }, // vg=14.5, c=17.0
      { code: '5BA', metric: 'forwardEvEbit', multiple: 14.0 }, // vg=13.0, c=15.0
      { code: '5BB', metric: 'forwardEvEbit', multiple: 12.0 }, // vg=11.0, c=13.0
      { code: '6AA', metric: 'evSales',       multiple: 9.0  }, // vg=8.0, c=10.0
      { code: '6BA', metric: 'evSales',       multiple: 6.5  }, // vg=5.5, c=7.0
      { code: '6BB', metric: 'evSales',       multiple: 5.0  }, // vg=4.5, c=5.5
      { code: '7AA', metric: 'evSales',       multiple: 13.0 }, // vg=11.0, c=15.0
      { code: '7BA', metric: 'evSales',       multiple: 10.0 }, // vg=8.5, c=11.0
    ];

    for (const { code, metric, multiple } of cases) {
      it(`${code} at ${metric}=${multiple} → comfortable_zone, ready, anchored`, () => {
        const result = computeValuation(makeInput({
          activeCode: code,
          forwardPe:    metric === 'forwardPe'    ? multiple : undefined,
          forwardEvEbit: metric === 'forwardEvEbit' ? multiple : undefined,
          evSales:      metric === 'evSales'      ? multiple : undefined,
        }));
        expect(result.valuationZone).toBe('comfortable_zone');
        expect(result.valuationStateStatus).toBe('computed');
        expect(result.thresholdSource).toBe('anchored');
        expect(result.derivedFromCode).toBeNull();
        expect(result.currentMultiple).toBe(multiple);
      });
    }
  });

  // ── B8 (bucket 8) — not_applicable ───────────────────────────────────────────

  it('8AA → not_applicable, null thresholds, null TSR hurdle', () => {
    const result = computeValuation(makeInput({ activeCode: '8AA' }));
    expect(result.valuationZone).toBe('not_applicable');
    expect(result.valuationStateStatus).toBe('not_applicable');
    expect(result.maxThreshold).toBeNull();
    expect(result.adjustedTsrHurdle).toBeNull();
  });

  // ── Zone boundary sweep for 4AA ───────────────────────────────────────────────
  // Verifies exact zone boundaries match threshold values

  describe('4AA zone boundary sweep (max=22, c=20, vg=18, steal=16)', () => {
    it('pe=15.9 → steal_zone',      () => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 15.9 })).valuationZone).toBe('steal_zone'));
    it('pe=16   → steal_zone',      () => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 16   })).valuationZone).toBe('steal_zone'));
    it('pe=17   → very_good_zone',  () => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 17   })).valuationZone).toBe('very_good_zone'));
    it('pe=18   → very_good_zone',  () => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 18   })).valuationZone).toBe('very_good_zone'));
    it('pe=19   → comfortable_zone',() => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 19   })).valuationZone).toBe('comfortable_zone'));
    it('pe=20   → comfortable_zone',() => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 20   })).valuationZone).toBe('comfortable_zone'));
    it('pe=21   → max_zone',        () => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 21   })).valuationZone).toBe('max_zone'));
    it('pe=22   → max_zone',        () => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 22   })).valuationZone).toBe('max_zone'));
    it('pe=22.1 → above_max',       () => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 22.1 })).valuationZone).toBe('above_max'));
    it('pe=30   → above_max',       () => expect(computeValuation(makeInput({ activeCode: '4AA', forwardPe: 30   })).valuationZone).toBe('above_max'));
  });

  // ── 10 derived code examples ───────────────────────────────────────────────────
  // Validates derivation engine end-to-end via computeValuation
  // Shifts: pe eq=[-2.5,-2.0] bs=[-1.0,-2.0]; ev_ebit eq=[-2.0,-2.0] bs=[-1.25,-2.0]; ev_sales eq=[-2.0,-1.75] bs=[-1.0,-1.75]

  describe('Derived codes — end-to-end zone computation', () => {
    // 4BC: from 4BA (bs A→C = -1.0+-2.0 = -3.0) → thresholds: [11.5, 10.0, 8.5, 7.0]
    it('4BC pe=9 → comfortable_zone (derived from 4BA, bs A→C)', () => {
      const result = computeValuation(makeInput({ activeCode: '4BC', forwardPe: 9 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 8.5 < 9 ≤ 10.0
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('4BA');
      expect(result.maxThreshold).toBe(11.5);
      expect(result.comfortableThreshold).toBe(10.0);
      expect(result.veryGoodThreshold).toBe(8.5);
      expect(result.stealThreshold).toBe(7.0);
    });

    // 4CA: ref=4BA (closest EQ: dist=1 vs 4AA dist=2), eq B→C = -2.0 → thresholds: [12.5, 11.0, 9.5, 8.0]
    it('4CA pe=10.5 → comfortable_zone (derived from 4BA, eq B→C)', () => {
      const result = computeValuation(makeInput({ activeCode: '4CA', forwardPe: 10.5 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 9.5 < 10.5 ≤ 11.0
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('4BA');
      expect(result.maxThreshold).toBe(12.5);
      expect(result.comfortableThreshold).toBe(11.0);
      expect(result.veryGoodThreshold).toBe(9.5);
      expect(result.stealThreshold).toBe(8.0);
    });

    // 4CC: from 4AA (eq A→C = -4.5, bs A→C = -3.0, total = -7.5) → [14.5, 12.5, 10.5, 8.5]
    it('4CC pe=11 → comfortable_zone (derived from 4AA, both EQ+BS C)', () => {
      const result = computeValuation(makeInput({ activeCode: '4CC', forwardPe: 11 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 10.5 < 11 ≤ 12.5
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('4AA');
      expect(result.maxThreshold).toBe(14.5);
      expect(result.comfortableThreshold).toBe(12.5);
      expect(result.veryGoodThreshold).toBe(10.5);
      expect(result.stealThreshold).toBe(8.5);
    });

    // 3BB: from 3BA (bs A→B = -1.0) → thresholds: [14.0, 12.5, 11.0, 9.5]
    it('3BB pe=12 → comfortable_zone (derived from 3BA, bs A→B)', () => {
      const result = computeValuation(makeInput({ activeCode: '3BB', forwardPe: 12 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 11 < 12 ≤ 12.5
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('3BA');
      expect(result.maxThreshold).toBe(14.0);
      expect(result.comfortableThreshold).toBe(12.5);
      expect(result.veryGoodThreshold).toBe(11.0);
      expect(result.stealThreshold).toBe(9.5);
    });

    // 1BC: from 1BA (bs A→C = -3.0) → thresholds: [5.5, 4.0, 2.5, 1.0]
    it('1BC pe=3 → comfortable_zone (derived from 1BA, bs A→C)', () => {
      const result = computeValuation(makeInput({ activeCode: '1BC', forwardPe: 3 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 2.5 < 3 ≤ 4.0
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('1BA');
      expect(result.stealThreshold).toBe(1.0); // floor enforcement
    });

    // 2CA: ref=2BA (closest EQ: dist=1 vs 2AA dist=2), eq B→C = -2.0 → thresholds: [11.5, 10.0, 8.5, 7.0]
    it('2CA pe=9 → comfortable_zone (derived from 2BA, eq B→C)', () => {
      const result = computeValuation(makeInput({ activeCode: '2CA', forwardPe: 9 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 8.5 < 9 ≤ 10.0
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('2BA');
      expect(result.maxThreshold).toBe(11.5);
      expect(result.comfortableThreshold).toBe(10.0);
      expect(result.veryGoodThreshold).toBe(8.5);
      expect(result.stealThreshold).toBe(7.0);
    });

    // 5AC: from 5AA (bs A→C = -1.25+-2.0 = -3.25) → thresholds: [16.75, 13.75, 11.25, 8.75]
    it('5AC evEbit=12.5 → comfortable_zone (derived from 5AA, bs A→C)', () => {
      const result = computeValuation(makeInput({ activeCode: '5AC', forwardEvEbit: 12.5 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 11.25 < 12.5 ≤ 13.75
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('5AA');
      expect(result.maxThreshold).toBe(16.75);
      expect(result.comfortableThreshold).toBe(13.75);
    });

    // 6AC: from 6AA (bs A→C = -1.0+-1.75 = -2.75) → thresholds: [9.25, 7.25, 5.25, 3.25]
    it('6AC evSales=6.5 → comfortable_zone (derived from 6AA, bs A→C)', () => {
      const result = computeValuation(makeInput({ activeCode: '6AC', evSales: 6.5 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 5.25 < 6.5 ≤ 7.25
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('6AA');
      expect(result.maxThreshold).toBe(9.25);
      expect(result.comfortableThreshold).toBe(7.25);
      expect(result.veryGoodThreshold).toBe(5.25);
      expect(result.stealThreshold).toBe(3.25);
    });

    // 7BC: from 7BA (bs A→C = -2.75) → thresholds: [11.25, 8.25, 5.75, 3.25]
    it('7BC evSales=7 → comfortable_zone (derived from 7BA, bs A→C)', () => {
      const result = computeValuation(makeInput({ activeCode: '7BC', evSales: 7 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 5.75 < 7 ≤ 8.25
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('7BA');
      expect(result.maxThreshold).toBe(11.25);
      expect(result.comfortableThreshold).toBe(8.25);
      expect(result.veryGoodThreshold).toBe(5.75);
    });

    // 3CA: from 3BA (eq B→C = -2.0) → thresholds: [13.0, 11.5, 10.0, 8.5]
    it('3CA pe=11 → comfortable_zone (derived from 3BA, eq B→C)', () => {
      const result = computeValuation(makeInput({ activeCode: '3CA', forwardPe: 11 }));
      expect(result.valuationZone).toBe('comfortable_zone');  // 10.0 < 11 ≤ 11.5
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('3BA');
      expect(result.maxThreshold).toBe(13.0);
      expect(result.comfortableThreshold).toBe(11.5);
      expect(result.veryGoodThreshold).toBe(10.0);
      expect(result.stealThreshold).toBe(8.5);
    });
  });

  // ── TSR hurdle spot check per anchored code ───────────────────────────────────
  // Verifies adjusted hurdle flows through computeValuation for each code

  describe('TSR hurdle spot check (AA code → base - 1.0 - 0.5)', () => {
    const aa_hurdles: Array<{ code: string; expectedHurdle: number }> = [
      { code: '1AA', expectedHurdle: 13.5  },  // 15.0 - 1.5
      { code: '2AA', expectedHurdle: 9.0   },  // 10.5 - 1.5
      { code: '3AA', expectedHurdle: 10.0  },  // 11.5 - 1.5
      { code: '4AA', expectedHurdle: 11.0  },  // 12.5 - 1.5
      { code: '5AA', expectedHurdle: 13.5  },  // 15.0 - 1.5
      { code: '6AA', expectedHurdle: 17.5  },  // 19.0 - 1.5
      { code: '7AA', expectedHurdle: 23.5  },  // 25.0 - 1.5
    ];

    for (const { code, expectedHurdle } of aa_hurdles) {
      it(`${code} → adjustedTsrHurdle=${expectedHurdle}`, () => {
        const result = computeValuation(makeInput({
          activeCode: code,
          forwardPe: 1,        // won't matter for hurdle
          forwardEvEbit: 1,
          evSales: 1,
        }));
        expect(result.adjustedTsrHurdle).toBe(expectedHurdle);
      });
    }
  });
});
