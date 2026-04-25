// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-003: Unit tests — ThresholdAssigner (assignThresholds)

import { assignThresholds } from '../../../src/domain/valuation/threshold-assigner';
import type { AnchoredThresholdRow } from '../../../src/domain/valuation/types';

// ── Full seeded anchored thresholds (all 16 rows from prisma/seed.ts) ───────────
const ANCHORED_THRESHOLDS: AnchoredThresholdRow[] = [
  // Bucket 1
  { code: '1AA', bucket: 1, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 10.0, comfortableThreshold: 8.5,  veryGoodThreshold: 7.0,  stealThreshold: 5.5  },
  { code: '1BA', bucket: 1, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 8.5,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
  // Bucket 2
  { code: '2AA', bucket: 2, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 16.0, comfortableThreshold: 14.0, veryGoodThreshold: 12.5, stealThreshold: 11.0 },
  { code: '2BA', bucket: 2, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 13.5, comfortableThreshold: 12.0, veryGoodThreshold: 10.5, stealThreshold: 9.0  },
  // Bucket 3
  { code: '3AA', bucket: 3, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_operating_earnings_ex_excess_cash', maxThreshold: 18.5, comfortableThreshold: 17.0, veryGoodThreshold: 15.5, stealThreshold: 14.0 },
  { code: '3BA', bucket: 3, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 15.0, comfortableThreshold: 13.5, veryGoodThreshold: 12.0, stealThreshold: 10.5 },
  // Bucket 4
  { code: '4AA', bucket: 4, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 22.0, comfortableThreshold: 20.0, veryGoodThreshold: 18.0, stealThreshold: 16.0 },
  { code: '4BA', bucket: 4, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_pe',                               maxThreshold: 14.5, comfortableThreshold: 13.0, veryGoodThreshold: 11.5, stealThreshold: 10.0 },
  // Bucket 5
  { code: '5AA', bucket: 5, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 20.0, comfortableThreshold: 17.0, veryGoodThreshold: 14.5, stealThreshold: 12.0 },
  { code: '5BA', bucket: 5, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 17.0, comfortableThreshold: 15.0, veryGoodThreshold: 13.0, stealThreshold: 11.0 },
  { code: '5BB', bucket: 5, earningsQuality: 'B', balanceSheetQuality: 'B', primaryMetric: 'forward_ev_ebit',                          maxThreshold: 15.0, comfortableThreshold: 13.0, veryGoodThreshold: 11.0, stealThreshold: 9.0  },
  // Bucket 6
  { code: '6AA', bucket: 6, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 12.0, comfortableThreshold: 10.0, veryGoodThreshold: 8.0,  stealThreshold: 6.0  },
  { code: '6BA', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 9.0,  comfortableThreshold: 7.0,  veryGoodThreshold: 5.5,  stealThreshold: 4.0  },
  { code: '6BB', bucket: 6, earningsQuality: 'B', balanceSheetQuality: 'B', primaryMetric: 'ev_sales',                                 maxThreshold: 7.0,  comfortableThreshold: 5.5,  veryGoodThreshold: 4.5,  stealThreshold: 3.0  },
  // Bucket 7
  { code: '7AA', bucket: 7, earningsQuality: 'A', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 18.0, comfortableThreshold: 15.0, veryGoodThreshold: 11.0, stealThreshold: 8.0  },
  { code: '7BA', bucket: 7, earningsQuality: 'B', balanceSheetQuality: 'A', primaryMetric: 'ev_sales',                                 maxThreshold: 14.0, comfortableThreshold: 11.0, veryGoodThreshold: 8.5,  stealThreshold: 6.0  },
];

describe('EPIC-005/STORY-075/TASK-075-003: assignThresholds()', () => {
  // ── All 16 anchored codes return exact seeded values ─────────────────────────

  describe('Anchored codes — exact seeded values', () => {
    const anchored_cases: Array<{
      code: string;
      max: number; comfortable: number; veryGood: number; steal: number;
    }> = [
      { code: '1AA', max: 10.0, comfortable: 8.5,  veryGood: 7.0,  steal: 5.5  },
      { code: '1BA', max: 8.5,  comfortable: 7.0,  veryGood: 5.5,  steal: 4.0  },
      { code: '2AA', max: 16.0, comfortable: 14.0, veryGood: 12.5, steal: 11.0 },
      { code: '2BA', max: 13.5, comfortable: 12.0, veryGood: 10.5, steal: 9.0  },
      { code: '3AA', max: 18.5, comfortable: 17.0, veryGood: 15.5, steal: 14.0 },
      { code: '3BA', max: 15.0, comfortable: 13.5, veryGood: 12.0, steal: 10.5 },
      { code: '4AA', max: 22.0, comfortable: 20.0, veryGood: 18.0, steal: 16.0 },
      { code: '4BA', max: 14.5, comfortable: 13.0, veryGood: 11.5, steal: 10.0 },
      { code: '5AA', max: 20.0, comfortable: 17.0, veryGood: 14.5, steal: 12.0 },
      { code: '5BA', max: 17.0, comfortable: 15.0, veryGood: 13.0, steal: 11.0 },
      { code: '5BB', max: 15.0, comfortable: 13.0, veryGood: 11.0, steal: 9.0  },
      { code: '6AA', max: 12.0, comfortable: 10.0, veryGood: 8.0,  steal: 6.0  },
      { code: '6BA', max: 9.0,  comfortable: 7.0,  veryGood: 5.5,  steal: 4.0  },
      { code: '6BB', max: 7.0,  comfortable: 5.5,  veryGood: 4.5,  steal: 3.0  },
      { code: '7AA', max: 18.0, comfortable: 15.0, veryGood: 11.0, steal: 8.0  },
      { code: '7BA', max: 14.0, comfortable: 11.0, veryGood: 8.5,  steal: 6.0  },
    ];

    for (const { code, max, comfortable, veryGood, steal } of anchored_cases) {
      it(`${code} returns exact seeded values`, () => {
        const result = assignThresholds(code, ANCHORED_THRESHOLDS);
        expect(result.maxThreshold).toBe(max);
        expect(result.comfortableThreshold).toBe(comfortable);
        expect(result.veryGoodThreshold).toBe(veryGood);
        expect(result.stealThreshold).toBe(steal);
        expect(result.thresholdSource).toBe('anchored');
        expect(result.derivedFromCode).toBeNull();
      });
    }
  });

  // ── Bucket 8: all null thresholds ───────────────────────────────────────────

  describe('Bucket 8', () => {
    it('B8 returns all null thresholds', () => {
      const result = assignThresholds('8AA', ANCHORED_THRESHOLDS);
      expect(result.maxThreshold).toBeNull();
      expect(result.comfortableThreshold).toBeNull();
      expect(result.veryGoodThreshold).toBeNull();
      expect(result.stealThreshold).toBeNull();
      // Source is still 'anchored' (B8 early return in implementation)
      expect(result.thresholdSource).toBe('anchored');
      expect(result.derivedFromCode).toBeNull();
    });
  });

  // ── Derived codes: spec examples ─────────────────────────────────────────────

  describe('Derived codes — spec examples', () => {
    it('4BB: derived from 4BA (same EQ=B), BS A→B = -1.0 each → 13.5/12/10.5/9', () => {
      const result = assignThresholds('4BB', ANCHORED_THRESHOLDS);
      expect(result.maxThreshold).toBe(13.5);
      expect(result.comfortableThreshold).toBe(12.0);
      expect(result.veryGoodThreshold).toBe(10.5);
      expect(result.stealThreshold).toBe(9.0);
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('4BA');
    });

    it('3CA: derived from 3BA (same BS=A), EQ B→C = -2.0 turns → 13/11.5/10/8.5', () => {
      const result = assignThresholds('3CA', ANCHORED_THRESHOLDS);
      expect(result.maxThreshold).toBe(13.0);
      expect(result.comfortableThreshold).toBe(11.5);
      expect(result.veryGoodThreshold).toBe(10.0);
      expect(result.stealThreshold).toBe(8.5);
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('3BA');
    });

    it('5BC: derived from 5BB (same EQ=B), BS B→C = -2.0 turns → 13/11/9/7', () => {
      const result = assignThresholds('5BC', ANCHORED_THRESHOLDS);
      expect(result.maxThreshold).toBe(13.0);
      expect(result.comfortableThreshold).toBe(11.0);
      expect(result.veryGoodThreshold).toBe(9.0);
      expect(result.stealThreshold).toBe(7.0);
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('5BB');
    });

    it('6BC: derived from 6BB (same EQ=B), BS B→C = -1.75x → 5.25/3.75/2.75/1.25', () => {
      const result = assignThresholds('6BC', ANCHORED_THRESHOLDS);
      expect(result.maxThreshold).toBe(5.25);
      expect(result.comfortableThreshold).toBe(3.75);
      expect(result.veryGoodThreshold).toBe(2.75);
      expect(result.stealThreshold).toBe(1.25);
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('6BB');
    });

    it('7BB: derived from 7BA (same EQ=B), BS A→B = -1.0x → 13/10/7.5/5', () => {
      const result = assignThresholds('7BB', ANCHORED_THRESHOLDS);
      expect(result.maxThreshold).toBe(13.0);
      expect(result.comfortableThreshold).toBe(10.0);
      expect(result.veryGoodThreshold).toBe(7.5);
      expect(result.stealThreshold).toBe(5.0);
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBe('7BA');
    });
  });

  // ── Floor enforcement ────────────────────────────────────────────────────────

  describe('Floor enforcement', () => {
    it('P/E derived C-grade code thresholds are all ≥ 1.0 (pe floor)', () => {
      const result = assignThresholds('3CA', ANCHORED_THRESHOLDS);
      // 3CA: 13/11.5/10/8.5 — all well above floor=1.0
      expect(result.stealThreshold!).toBeGreaterThanOrEqual(1.0);
      expect(result.veryGoodThreshold!).toBeGreaterThanOrEqual(1.0);
      expect(result.comfortableThreshold!).toBeGreaterThanOrEqual(1.0);
      expect(result.maxThreshold!).toBeGreaterThanOrEqual(1.0);
    });

    it('EV/Sales derived C-grade code thresholds are all ≥ 0.5 (ev_sales floor)', () => {
      const result = assignThresholds('6BC', ANCHORED_THRESHOLDS);
      // 6BC: 5.25/3.75/2.75/1.25 — all above floor=0.5
      expect(result.stealThreshold!).toBeGreaterThanOrEqual(0.5);
      expect(result.veryGoodThreshold!).toBeGreaterThanOrEqual(0.5);
      expect(result.comfortableThreshold!).toBeGreaterThanOrEqual(0.5);
      expect(result.maxThreshold!).toBeGreaterThanOrEqual(0.5);
    });

    it('EV/EBIT derived C-grade code thresholds are all ≥ 1.0 (ev_ebit floor)', () => {
      const result = assignThresholds('5BC', ANCHORED_THRESHOLDS);
      // 5BC: 13/11/9/7 — all above floor=1.0
      expect(result.stealThreshold!).toBeGreaterThanOrEqual(1.0);
    });
  });

  // ── Descending order invariant ───────────────────────────────────────────────

  describe('Descending order invariant', () => {
    const derived_codes = ['4BB', '3CA', '5BC', '6BC', '7BB'];

    for (const code of derived_codes) {
      it(`${code}: max > comfortable > veryGood > steal`, () => {
        const result = assignThresholds(code, ANCHORED_THRESHOLDS);
        expect(result.maxThreshold!).toBeGreaterThan(result.comfortableThreshold!);
        expect(result.comfortableThreshold!).toBeGreaterThan(result.veryGoodThreshold!);
        expect(result.veryGoodThreshold!).toBeGreaterThan(result.stealThreshold!);
      });
    }
  });

  // ── Pre-operating-leverage B5: metricFamily switches to ev_sales ─────────────

  describe('Pre-op-leverage flag: B5 with preOpLev=true switches metricFamily to ev_sales', () => {
    it('5AA with preOpLev=false: metricFamily=ev_ebit, uses anchored B5 values', () => {
      const result_normal = assignThresholds('5AA', ANCHORED_THRESHOLDS, false);
      expect(result_normal.thresholdSource).toBe('anchored');
      expect(result_normal.metricFamily).toBe('ev_ebit');
      expect(result_normal.maxThreshold).toBe(20.0);
      expect(result_normal.comfortableThreshold).toBe(17.0);
      expect(result_normal.veryGoodThreshold).toBe(14.5);
      expect(result_normal.stealThreshold).toBe(12.0);
    });

    it('5AA with preOpLev=true: metricFamily=ev_sales, still returns anchored B5 threshold values', () => {
      // Exact code '5AA' is found in anchors → returns anchored values regardless of preOpLev
      // The preOpLev only changes the metricFamily (for secondary adjustment purposes)
      const result_preop = assignThresholds('5AA', ANCHORED_THRESHOLDS, true);
      expect(result_preop.thresholdSource).toBe('anchored');
      expect(result_preop.metricFamily).toBe('ev_sales');
      expect(result_preop.maxThreshold).toBe(20.0);
      expect(result_preop.comfortableThreshold).toBe(17.0);
      expect(result_preop.veryGoodThreshold).toBe(14.5);
      expect(result_preop.stealThreshold).toBe(12.0);
    });

    it('5BA with preOpLev=true: metricFamily=ev_sales, anchored B5 values retained', () => {
      const result = assignThresholds('5BA', ANCHORED_THRESHOLDS, true);
      expect(result.thresholdSource).toBe('anchored');
      expect(result.metricFamily).toBe('ev_sales');
      expect(result.maxThreshold).toBe(17.0);
      expect(result.comfortableThreshold).toBe(15.0);
      expect(result.veryGoodThreshold).toBe(13.0);
      expect(result.stealThreshold).toBe(11.0);
    });

    it('5BC (non-anchored) with preOpLev=true: derives from B6 ev_sales anchors', () => {
      // 5BC is not in anchors; with preOpLev=true, effectiveBucket=6, family=ev_sales
      // Derivation picks best B6 anchor: same EQ=B → 6BB (closest BS: B vs C)
      // 6BB: 7/5.5/4.5/3; BS B→C = -1.75 → 5.25/3.75/2.75/1.25
      const result = assignThresholds('5BC', ANCHORED_THRESHOLDS, true);
      expect(result.thresholdSource).toBe('derived');
      expect(result.metricFamily).toBe('ev_sales');
      expect(result.maxThreshold).toBe(5.25);
      expect(result.comfortableThreshold).toBe(3.75);
      expect(result.veryGoodThreshold).toBe(2.75);
      expect(result.stealThreshold).toBe(1.25);
      expect(result.derivedFromCode).toBe('6BB');
    });
  });

  // ── Empty anchors fallback ───────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('returns null thresholds when no anchors available for derivation', () => {
      const result = assignThresholds('4CC', []);
      expect(result.maxThreshold).toBeNull();
      expect(result.comfortableThreshold).toBeNull();
      expect(result.veryGoodThreshold).toBeNull();
      expect(result.stealThreshold).toBeNull();
      expect(result.thresholdSource).toBe('derived');
      expect(result.derivedFromCode).toBeNull();
    });
  });
});
