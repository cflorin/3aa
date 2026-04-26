// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-081: EPIC-005 Regression & Integration Tests
// TASK-081-002: Full 8-bucket × 9 EQ/BS combination matrix (72 tests)
// Source: docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 4

import { calculateTsrHurdle } from '../../../src/domain/valuation/tsr-hurdle-calculator';
import type { TsrHurdleRow } from '../../../src/domain/valuation/types';

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

// Adjustments (same for all buckets in seed data):
// EQ: A=-1.0, B=0.0, C=+2.5
// BS: A=-0.5, B=0.0, C=+1.75
// Combo adj = eqAdj + bsAdj
const ADJ: Record<string, number> = {
  AA: -1.5, AB: -1.0, AC:  0.75,
  BA: -0.5, BB:  0.0, BC:  1.75,
  CA:  2.0, CB:  2.5, CC:  4.25,
};

// Base hurdle defaults per bucket
const BASE: Record<number, number | null> = {
  1: 15.00, 2: 10.50, 3: 11.50, 4: 12.50,
  5: 15.00, 6: 19.00, 7: 25.00, 8: null,
};

describe('EPIC-005/STORY-081/TASK-081-002: TSR hurdle full 8×9 combination matrix', () => {

  // ── Buckets 1–7: 9 combinations each ──────────────────────────────────────────

  for (const bucket of [1, 2, 3, 4, 5, 6, 7]) {
    describe(`Bucket ${bucket} (base=${BASE[bucket]})`, () => {
      for (const combo of ['AA', 'AB', 'AC', 'BA', 'BB', 'BC', 'CA', 'CB', 'CC']) {
        const code = `${bucket}${combo}`;
        const base = BASE[bucket] as number;
        const expected = Math.round((base + ADJ[combo]) * 100) / 100;

        it(`${code} → adjustedTsrHurdle=${expected}`, () => {
          const result = calculateTsrHurdle(code, TSR_HURDLES);
          expect(result.adjustedTsrHurdle).toBeCloseTo(expected, 5);
          expect(result.baseTsrHurdleDefault).toBe(base);
          expect(result.hurdleSource).toBe('default');
          expect(result.tsrReasonCodes).toContain(`bucket_${bucket}_base`);
        });
      }
    });
  }

  // ── Bucket 8: all 9 combinations → null hurdle ────────────────────────────────

  describe('Bucket 8 — all 9 combinations → null hurdle (no normal hurdle)', () => {
    for (const combo of ['AA', 'AB', 'AC', 'BA', 'BB', 'BC', 'CA', 'CB', 'CC']) {
      it(`8${combo} → adjustedTsrHurdle=null`, () => {
        const result = calculateTsrHurdle(`8${combo}`, TSR_HURDLES);
        expect(result.adjustedTsrHurdle).toBeNull();
        expect(result.baseTsrHurdleDefault).toBeNull();
        expect(result.tsrReasonCodes).toContain('bucket_8_no_hurdle');
      });
    }
  });

  // ── Spot-check: verify BB combinations have no adjustment reason codes ────────

  describe('BB combinations (both adjustments = 0) → only bucket reason code', () => {
    for (const bucket of [1, 2, 3, 4, 5, 6, 7]) {
      it(`${bucket}BB → tsrReasonCodes = ['bucket_${bucket}_base']`, () => {
        const result = calculateTsrHurdle(`${bucket}BB`, TSR_HURDLES);
        expect(result.tsrReasonCodes).toEqual([`bucket_${bucket}_base`]);
        expect(result.adjustedTsrHurdle).toBe(BASE[bucket]);
      });
    }
  });

  // ── Spot-check: CC combinations have maximum hurdle ──────────────────────────

  describe('CC combinations have highest adjusted hurdle per bucket', () => {
    const cc_cases = [
      { code: '1CC', expected: Math.round((15.00 + 4.25) * 100) / 100 },  // 19.25
      { code: '4CC', expected: Math.round((12.50 + 4.25) * 100) / 100 },  // 16.75
      { code: '6CC', expected: Math.round((19.00 + 4.25) * 100) / 100 },  // 23.25
      { code: '7CC', expected: Math.round((25.00 + 4.25) * 100) / 100 },  // 29.25
    ];
    for (const { code, expected } of cc_cases) {
      it(`${code} → ${expected} (bucket max + 4.25)`, () => {
        const result = calculateTsrHurdle(code, TSR_HURDLES);
        expect(result.adjustedTsrHurdle).toBeCloseTo(expected, 5);
      });
    }
  });
});
