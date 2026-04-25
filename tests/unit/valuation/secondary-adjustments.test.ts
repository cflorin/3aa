// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-005: Unit tests — SecondaryAdjustments (applySecondaryAdjustments)

import { applySecondaryAdjustments } from '../../../src/domain/valuation/secondary-adjustments';
import type { AdjustmentInput } from '../../../src/domain/valuation/secondary-adjustments';

// ── Helper to build a minimal AdjustmentInput ────────────────────────────────

function makeInput(override: Partial<AdjustmentInput>): AdjustmentInput {
  return {
    activeCode: '6BA',
    metricFamily: 'ev_sales',
    primaryMetric: 'ev_sales',
    maxThreshold: 9.0,
    comfortableThreshold: 7.0,
    veryGoodThreshold: 5.5,
    stealThreshold: 4.0,
    ...override,
  };
}

describe('EPIC-005/STORY-075/TASK-075-005: applySecondaryAdjustments()', () => {
  // ── §5.1 Gross margin adjustment ─────────────────────────────────────────────

  describe('§5.1 Gross margin adjustment (B6/B7 ev_sales only)', () => {
    it('B6 ev_sales + grossMargin > 80% → +1.0x to all thresholds, grossMarginAdjustmentApplied=true', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        grossMargin: 0.85,
      }));
      expect(result.maxThreshold).toBe(10.0);
      expect(result.comfortableThreshold).toBe(8.0);
      expect(result.veryGoodThreshold).toBe(6.5);
      expect(result.stealThreshold).toBe(5.0);
      expect(result.grossMarginAdjustmentApplied).toBe(true);
      expect(result.thresholdAdjustments).toHaveLength(1);
      expect(result.thresholdAdjustments[0].type).toBe('gross_margin');
      expect(result.thresholdAdjustments[0].delta).toBe(1.0);
    });

    it('B6 ev_sales + grossMargin exactly 80% → no gross margin adjustment (boundary)', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        grossMargin: 0.80,
      }));
      expect(result.grossMarginAdjustmentApplied).toBe(false);
      expect(result.maxThreshold).toBe(9.0);
      expect(result.stealThreshold).toBe(4.0);
    });

    it('B6 ev_sales + grossMargin 60-80% → no change', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        grossMargin: 0.75,
      }));
      expect(result.grossMarginAdjustmentApplied).toBe(false);
      expect(result.maxThreshold).toBe(9.0);
      expect(result.comfortableThreshold).toBe(7.0);
      expect(result.veryGoodThreshold).toBe(5.5);
      expect(result.stealThreshold).toBe(4.0);
      expect(result.thresholdAdjustments).toHaveLength(0);
    });

    it('B6 ev_sales + grossMargin exactly 60% → no gross margin adjustment (boundary)', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        grossMargin: 0.60,
      }));
      expect(result.grossMarginAdjustmentApplied).toBe(false);
    });

    it('B6 ev_sales + grossMargin < 60% → -1.5x to all thresholds', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        grossMargin: 0.45,
      }));
      // 9.0-1.5=7.5, 7.0-1.5=5.5, 5.5-1.5=4.0, 4.0-1.5=2.5
      expect(result.maxThreshold).toBe(7.5);
      expect(result.comfortableThreshold).toBe(5.5);
      expect(result.veryGoodThreshold).toBe(4.0);
      expect(result.stealThreshold).toBe(2.5);
      expect(result.grossMarginAdjustmentApplied).toBe(true);
      expect(result.thresholdAdjustments[0].delta).toBe(-1.5);
      expect(result.thresholdAdjustments[0].reason).toBe('gross_margin_below_60pct');
    });

    it('B7 ev_sales + grossMargin < 60% → -1.5x to all thresholds', () => {
      // 7BA: 14/11/8.5/6
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '7BA',
        metricFamily: 'ev_sales',
        maxThreshold: 14.0,
        comfortableThreshold: 11.0,
        veryGoodThreshold: 8.5,
        stealThreshold: 6.0,
        grossMargin: 0.45,
      }));
      expect(result.maxThreshold).toBe(12.5);
      expect(result.comfortableThreshold).toBe(9.5);
      expect(result.veryGoodThreshold).toBe(7.0);
      expect(result.stealThreshold).toBe(4.5);
      expect(result.grossMarginAdjustmentApplied).toBe(true);
    });

    it('B4 (P/E) → gross margin adjustment does NOT fire', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '4AA',
        metricFamily: 'pe',
        primaryMetric: 'forward_pe',
        maxThreshold: 22.0,
        comfortableThreshold: 20.0,
        veryGoodThreshold: 18.0,
        stealThreshold: 16.0,
        grossMargin: 0.90,
      }));
      expect(result.grossMarginAdjustmentApplied).toBe(false);
      expect(result.maxThreshold).toBe(22.0);
    });

    it('B5 (EV/EBIT) → gross margin adjustment does NOT fire', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '5AA',
        metricFamily: 'ev_ebit',
        primaryMetric: 'forward_ev_ebit',
        maxThreshold: 20.0,
        comfortableThreshold: 17.0,
        veryGoodThreshold: 14.5,
        stealThreshold: 12.0,
        grossMargin: 0.90,
      }));
      expect(result.grossMarginAdjustmentApplied).toBe(false);
      expect(result.maxThreshold).toBe(20.0);
    });

    it('B6 with null grossMargin → no adjustment', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        grossMargin: null,
      }));
      expect(result.grossMarginAdjustmentApplied).toBe(false);
    });
  });

  // ── §5.3 Dilution adjustment ─────────────────────────────────────────────────

  describe('§5.3 Dilution adjustment (B5, B6, B7)', () => {
    it('B5 (ev_ebit) + shareCountGrowth3y=0.06 → -1.0 turn, dilutionAdjustmentApplied=true', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '5AA',
        metricFamily: 'ev_ebit',
        primaryMetric: 'forward_ev_ebit',
        maxThreshold: 20.0,
        comfortableThreshold: 17.0,
        veryGoodThreshold: 14.5,
        stealThreshold: 12.0,
        shareCountGrowth3y: 0.06,
      }));
      expect(result.maxThreshold).toBe(19.0);
      expect(result.comfortableThreshold).toBe(16.0);
      expect(result.veryGoodThreshold).toBe(13.5);
      expect(result.stealThreshold).toBe(11.0);
      expect(result.dilutionAdjustmentApplied).toBe(true);
      expect(result.thresholdAdjustments.some(a => a.type === 'dilution')).toBe(true);
      expect(result.thresholdAdjustments.find(a => a.type === 'dilution')!.reason).toBe('share_count_growth_above_5pct');
    });

    it('B5 + shareCountGrowth3y=0.05 (exactly 5%) → no dilution (boundary)', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '5AA',
        metricFamily: 'ev_ebit',
        primaryMetric: 'forward_ev_ebit',
        maxThreshold: 20.0,
        comfortableThreshold: 17.0,
        veryGoodThreshold: 14.5,
        stealThreshold: 12.0,
        shareCountGrowth3y: 0.05,
      }));
      expect(result.dilutionAdjustmentApplied).toBe(false);
      expect(result.maxThreshold).toBe(20.0);
    });

    it('B7 ev_sales + materialDilutionFlag=true → -1.0x, dilutionAdjustmentApplied=true', () => {
      // 7BA: 14/11/8.5/6 → -1.0 → 13/10/7.5/5
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '7BA',
        metricFamily: 'ev_sales',
        maxThreshold: 14.0,
        comfortableThreshold: 11.0,
        veryGoodThreshold: 8.5,
        stealThreshold: 6.0,
        materialDilutionFlag: true,
      }));
      expect(result.maxThreshold).toBe(13.0);
      expect(result.comfortableThreshold).toBe(10.0);
      expect(result.veryGoodThreshold).toBe(7.5);
      expect(result.stealThreshold).toBe(5.0);
      expect(result.dilutionAdjustmentApplied).toBe(true);
      expect(result.thresholdAdjustments.find(a => a.type === 'dilution')!.reason).toBe('material_dilution_flag');
    });

    it('B4 (P/E) + materialDilutionFlag=true → dilution NOT triggered (bucket < 5)', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '4AA',
        metricFamily: 'pe',
        primaryMetric: 'forward_pe',
        maxThreshold: 22.0,
        comfortableThreshold: 20.0,
        veryGoodThreshold: 18.0,
        stealThreshold: 16.0,
        materialDilutionFlag: true,
      }));
      expect(result.dilutionAdjustmentApplied).toBe(false);
      expect(result.maxThreshold).toBe(22.0);
    });

    it('B4 + shareCountGrowth3y=0.10 → dilution NOT triggered (bucket < 5)', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '4BA',
        metricFamily: 'pe',
        primaryMetric: 'forward_pe',
        maxThreshold: 14.5,
        comfortableThreshold: 13.0,
        veryGoodThreshold: 11.5,
        stealThreshold: 10.0,
        shareCountGrowth3y: 0.10,
      }));
      expect(result.dilutionAdjustmentApplied).toBe(false);
      expect(result.maxThreshold).toBe(14.5);
    });

    it('B6 + shareCountGrowth3y=0.08 → dilution fires for bucket 6', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        shareCountGrowth3y: 0.08,
      }));
      expect(result.dilutionAdjustmentApplied).toBe(true);
    });
  });

  // ── Cyclicality flag passthrough ─────────────────────────────────────────────

  describe('Cyclicality flag passthrough', () => {
    it('cyclicalityFlag=true → cyclicalityContextFlag=true in result', () => {
      const result = applySecondaryAdjustments(makeInput({
        cyclicalityFlag: true,
      }));
      expect(result.cyclicalityContextFlag).toBe(true);
    });

    it('cyclicalityFlag=false → cyclicalityContextFlag=false', () => {
      const result = applySecondaryAdjustments(makeInput({
        cyclicalityFlag: false,
      }));
      expect(result.cyclicalityContextFlag).toBe(false);
    });

    it('cyclicalityFlag undefined → cyclicalityContextFlag=false', () => {
      const result = applySecondaryAdjustments(makeInput({}));
      expect(result.cyclicalityContextFlag).toBe(false);
    });
  });

  // ── Both adjustments can apply together ──────────────────────────────────────

  describe('Combined adjustments', () => {
    it('B6 ev_sales + grossMargin > 80% then dilution → net result: original thresholds', () => {
      // 6BA base: 9/7/5.5/4 → +1.0 (gm) → 10/8/6.5/5 → -1.0 (dilution) → 9/7/5.5/4
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        grossMargin: 0.85,
        materialDilutionFlag: true,
      }));
      expect(result.maxThreshold).toBe(9.0);
      expect(result.comfortableThreshold).toBe(7.0);
      expect(result.veryGoodThreshold).toBe(5.5);
      expect(result.stealThreshold).toBe(4.0);
      expect(result.grossMarginAdjustmentApplied).toBe(true);
      expect(result.dilutionAdjustmentApplied).toBe(true);
      expect(result.thresholdAdjustments).toHaveLength(2);
    });

    it('Both adjustments: adjustment array has gross_margin first, then dilution', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BA',
        metricFamily: 'ev_sales',
        grossMargin: 0.85,
        shareCountGrowth3y: 0.07,
      }));
      expect(result.thresholdAdjustments[0].type).toBe('gross_margin');
      expect(result.thresholdAdjustments[1].type).toBe('dilution');
    });
  });

  // ── EV/Sales floor respected after dilution ──────────────────────────────────

  describe('EV/Sales floor respected after adjustments', () => {
    it('EV/Sales thresholds cannot go below 0.5 after dilution', () => {
      // Use very low base thresholds close to floor
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6BC',
        metricFamily: 'ev_sales',
        maxThreshold: 1.5,
        comfortableThreshold: 1.25,
        veryGoodThreshold: 1.0,
        stealThreshold: 0.75,
        materialDilutionFlag: true,  // -1.0x
      }));
      // After -1.0: 0.5/0.25/0.0/-0.25 → all floored to 0.5
      expect(result.stealThreshold).toBeGreaterThanOrEqual(0.5);
      expect(result.veryGoodThreshold).toBeGreaterThanOrEqual(0.5);
      expect(result.comfortableThreshold).toBeGreaterThanOrEqual(0.5);
      expect(result.maxThreshold).toBeGreaterThanOrEqual(0.5);
    });

    it('EV/Sales thresholds cannot go below 0.5 after negative gross margin adjustment', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '7BA',
        metricFamily: 'ev_sales',
        maxThreshold: 1.0,
        comfortableThreshold: 0.9,
        veryGoodThreshold: 0.8,
        stealThreshold: 0.7,
        grossMargin: 0.30,  // < 60% → -1.5x
      }));
      // After -1.5: all negative → floored to 0.5
      expect(result.stealThreshold).toBeGreaterThanOrEqual(0.5);
      expect(result.maxThreshold).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ── No adjustments on null thresholds ────────────────────────────────────────

  describe('Null threshold passthrough', () => {
    it('null thresholds remain null after adjustments', () => {
      const result = applySecondaryAdjustments(makeInput({
        activeCode: '6AA',
        metricFamily: 'ev_sales',
        maxThreshold: null,
        comfortableThreshold: null,
        veryGoodThreshold: null,
        stealThreshold: null,
        grossMargin: 0.90,
        materialDilutionFlag: true,
      }));
      expect(result.maxThreshold).toBeNull();
      expect(result.comfortableThreshold).toBeNull();
      expect(result.veryGoodThreshold).toBeNull();
      expect(result.stealThreshold).toBeNull();
    });
  });
});
