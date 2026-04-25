// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-004: Unit tests — TsrHurdleCalculator (calculateTsrHurdle)

import { calculateTsrHurdle } from '../../../src/domain/valuation/tsr-hurdle-calculator';
import type { TsrHurdleRow } from '../../../src/domain/valuation/types';

// Full seeded TSR hurdles (all 8 rows from prisma/seed.ts)
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

describe('EPIC-005/STORY-075/TASK-075-004: calculateTsrHurdle()', () => {
  // ── All 8 buckets with AA code: base hurdle defaults ─────────────────────────

  describe('AA code base hurdle defaults', () => {
    const aa_cases: Array<{ bucket: number; code: string; base: number; adjusted: number }> = [
      { bucket: 1, code: '1AA', base: 15.00, adjusted: 15.00 + (-1.0) + (-0.5) }, // 13.5
      { bucket: 2, code: '2AA', base: 10.50, adjusted: 10.50 + (-1.0) + (-0.5) }, // 9.0
      { bucket: 3, code: '3AA', base: 11.50, adjusted: 11.50 + (-1.0) + (-0.5) }, // 10.0
      { bucket: 4, code: '4AA', base: 12.50, adjusted: 12.50 + (-1.0) + (-0.5) }, // 11.0
      { bucket: 5, code: '5AA', base: 15.00, adjusted: 15.00 + (-1.0) + (-0.5) }, // 13.5
      { bucket: 6, code: '6AA', base: 19.00, adjusted: 19.00 + (-1.0) + (-0.5) }, // 17.5
      { bucket: 7, code: '7AA', base: 25.00, adjusted: 25.00 + (-1.0) + (-0.5) }, // 23.5
    ];

    for (const { bucket, code, base, adjusted } of aa_cases) {
      it(`${code} → base ${base}, adjusted ${adjusted}`, () => {
        const result = calculateTsrHurdle(code, TSR_HURDLES);
        expect(result.baseTsrHurdleDefault).toBe(base);
        expect(result.adjustedTsrHurdle).toBeCloseTo(adjusted, 5);
        expect(result.hurdleSource).toBe('default');
        expect(result.tsrReasonCodes).toContain(`bucket_${bucket}_base`);
      });
    }
  });

  // ── Key spec combinations ────────────────────────────────────────────────────

  describe('Key spec combinations', () => {
    it('4AA: 12.5 - 1.0 - 0.5 = 11.0', () => {
      const result = calculateTsrHurdle('4AA', TSR_HURDLES);
      expect(result.adjustedTsrHurdle).toBe(11.0);
      expect(result.tsrReasonCodes).toContain('bucket_4_base');
      expect(result.tsrReasonCodes).toContain('eq_A_-1');
      expect(result.tsrReasonCodes).toContain('bs_A_-0.5');
    });

    it('4BA: 12.5 + 0 - 0.5 = 12.0', () => {
      const result = calculateTsrHurdle('4BA', TSR_HURDLES);
      expect(result.adjustedTsrHurdle).toBe(12.0);
      expect(result.tsrReasonCodes).toContain('bucket_4_base');
      // EQ B adjustment is 0 — no reason code for that
      expect(result.tsrReasonCodes).toContain('bs_A_-0.5');
      expect(result.tsrReasonCodes).not.toContain('eq_B_0');
    });

    it('3AA: 11.5 - 1.0 - 0.5 = 10.0', () => {
      const result = calculateTsrHurdle('3AA', TSR_HURDLES);
      expect(result.adjustedTsrHurdle).toBe(10.0);
    });

    it('5BB: 15.0 + 0 + 0 = 15.0', () => {
      const result = calculateTsrHurdle('5BB', TSR_HURDLES);
      expect(result.adjustedTsrHurdle).toBe(15.0);
      // No adjustments: no extra reason codes
      expect(result.tsrReasonCodes).toEqual(['bucket_5_base']);
    });

    it('6BA: 19.0 + 0 - 0.5 = 18.5', () => {
      const result = calculateTsrHurdle('6BA', TSR_HURDLES);
      expect(result.adjustedTsrHurdle).toBe(18.5);
      expect(result.tsrReasonCodes).toContain('bucket_6_base');
      expect(result.tsrReasonCodes).toContain('bs_A_-0.5');
    });

    it('6CC (derived code): 19.0 + 2.5 + 1.75 = 23.25', () => {
      const result = calculateTsrHurdle('6CC', TSR_HURDLES);
      expect(result.adjustedTsrHurdle).toBe(23.25);
      expect(result.tsrReasonCodes).toContain('bucket_6_base');
      expect(result.tsrReasonCodes).toContain('eq_C_+2.5');
      expect(result.tsrReasonCodes).toContain('bs_C_+1.75');
    });
  });

  // ── Bucket 8: no hurdle ──────────────────────────────────────────────────────

  describe('Bucket 8', () => {
    it('8AA → adjustedTsrHurdle=null', () => {
      const result = calculateTsrHurdle('8AA', TSR_HURDLES);
      expect(result.baseTsrHurdleDefault).toBeNull();
      expect(result.adjustedTsrHurdle).toBeNull();
      expect(result.tsrReasonCodes).toContain('bucket_8_no_hurdle');
    });

    it('8BA → adjustedTsrHurdle=null', () => {
      const result = calculateTsrHurdle('8BA', TSR_HURDLES);
      expect(result.adjustedTsrHurdle).toBeNull();
    });

    it('8AA returns bucket label', () => {
      const result = calculateTsrHurdle('8AA', TSR_HURDLES);
      expect(result.baseTsrHurdleLabel).toBe('No normal hurdle');
    });
  });

  // ── reasonCodes includes bucket label and adjustment codes ───────────────────

  describe('reasonCodes composition', () => {
    it('AA code includes bucket and both negative adjustment reason codes', () => {
      const result = calculateTsrHurdle('1AA', TSR_HURDLES);
      expect(result.tsrReasonCodes).toContain('bucket_1_base');
      expect(result.tsrReasonCodes).toContain('eq_A_-1');
      expect(result.tsrReasonCodes).toContain('bs_A_-0.5');
    });

    it('BB code has only bucket reason code (both adjustments are 0)', () => {
      const result = calculateTsrHurdle('5BB', TSR_HURDLES);
      expect(result.tsrReasonCodes).toEqual(['bucket_5_base']);
    });

    it('BA code includes only bs reason code (eq adjustment is 0)', () => {
      const result = calculateTsrHurdle('6BA', TSR_HURDLES);
      expect(result.tsrReasonCodes).toContain('bucket_6_base');
      expect(result.tsrReasonCodes).toContain('bs_A_-0.5');
      expect(result.tsrReasonCodes).not.toContain('eq_B_0');
    });

    it('CC code includes positive adjustment reason codes', () => {
      const result = calculateTsrHurdle('7CC', TSR_HURDLES);
      expect(result.tsrReasonCodes).toContain('bucket_7_base');
      expect(result.tsrReasonCodes).toContain('eq_C_+2.5');
      expect(result.tsrReasonCodes).toContain('bs_C_+1.75');
    });
  });

  // ── hurdleSource is always 'default' ────────────────────────────────────────

  describe('hurdleSource', () => {
    const codes = ['1AA', '3BA', '5BB', '6BA', '7AA'];
    for (const code of codes) {
      it(`${code} → hurdleSource='default'`, () => {
        const result = calculateTsrHurdle(code, TSR_HURDLES);
        expect(result.hurdleSource).toBe('default');
      });
    }
  });

  // ── baseTsrHurdleLabel is returned ──────────────────────────────────────────

  describe('baseTsrHurdleLabel', () => {
    const label_cases: Array<{ code: string; label: string }> = [
      { code: '1AA', label: '14-16%+' },
      { code: '2BA', label: '10-11%' },
      { code: '3AA', label: '11-12%' },
      { code: '4AA', label: '12-13%' },
      { code: '5BB', label: '14-16%' },
      { code: '6BA', label: '18-20%+' },
      { code: '7BA', label: '25%+' },
    ];

    for (const { code, label } of label_cases) {
      it(`${code} → baseTsrHurdleLabel='${label}'`, () => {
        const result = calculateTsrHurdle(code, TSR_HURDLES);
        expect(result.baseTsrHurdleLabel).toBe(label);
      });
    }
  });

  // ── Missing hurdle data ──────────────────────────────────────────────────────

  describe('Missing hurdle data', () => {
    it('returns null adjustedTsrHurdle when hurdle row is missing', () => {
      const result = calculateTsrHurdle('4AA', []);
      expect(result.adjustedTsrHurdle).toBeNull();
      expect(result.tsrReasonCodes).toContain('missing_hurdle_data');
    });
  });
});
