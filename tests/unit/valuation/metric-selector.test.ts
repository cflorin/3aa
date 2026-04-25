// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-002: Unit tests — MetricSelector (selectMetric)

import { selectMetric } from '../../../src/domain/valuation/metric-selector';
import type { ValuationInput } from '../../../src/domain/valuation/types';

// Minimal valid ValuationInput (no anchored data needed for selectMetric)
function makeInput(override: Partial<ValuationInput>): ValuationInput {
  return {
    activeCode: '1AA',
    anchoredThresholds: [],
    tsrHurdles: [],
    ...override,
  };
}

describe('EPIC-005/STORY-075/TASK-075-002: selectMetric()', () => {
  // ── Buckets 1–4: forward_pe ─────────────────────────────────────────────────

  describe('Buckets 1–4 → forward_pe', () => {
    const pe_buckets: Array<{ code: string; label: string }> = [
      { code: '1AA', label: 'bucket_1' },
      { code: '1BA', label: 'bucket_1' },
      { code: '2AA', label: 'bucket_2' },
      { code: '2BA', label: 'bucket_2' },
      { code: '3BA', label: 'bucket_3' },
      { code: '4AA', label: 'bucket_4' },
      { code: '4BA', label: 'bucket_4' },
    ];

    for (const { code, label } of pe_buckets) {
      it(`${code} → forward_pe with reason ${label}`, () => {
        const result = selectMetric(makeInput({ activeCode: code }));
        expect(result.primaryMetric).toBe('forward_pe');
        expect(result.metricReason).toBe(label);
      });
    }
  });

  // ── 3AA with holdingCompanyFlag ─────────────────────────────────────────────

  describe('Bucket 3AA special cases', () => {
    it('3AA + holdingCompanyFlag=true → forward_operating_earnings_ex_excess_cash', () => {
      const result = selectMetric(makeInput({ activeCode: '3AA', holdingCompanyFlag: true }));
      expect(result.primaryMetric).toBe('forward_operating_earnings_ex_excess_cash');
      expect(result.metricReason).toBe('bucket_3AA_holding_company');
    });

    it('3AA + insurerFlag=true → forward_operating_earnings_ex_excess_cash', () => {
      const result = selectMetric(makeInput({ activeCode: '3AA', insurerFlag: true }));
      expect(result.primaryMetric).toBe('forward_operating_earnings_ex_excess_cash');
      expect(result.metricReason).toBe('bucket_3AA_holding_company');
    });

    it('3AA without holdingCompanyFlag or insurerFlag → forward_pe', () => {
      const result = selectMetric(makeInput({ activeCode: '3AA' }));
      expect(result.primaryMetric).toBe('forward_pe');
      expect(result.metricReason).toBe('bucket_3');
    });

    it('3BA + holdingCompanyFlag=true → forward_pe (flag only applies to 3AA)', () => {
      const result = selectMetric(makeInput({ activeCode: '3BA', holdingCompanyFlag: true }));
      expect(result.primaryMetric).toBe('forward_pe');
      expect(result.metricReason).toBe('bucket_3');
    });

    it('4AA + holdingCompanyFlag=true → forward_pe (flag only applies to bucket 3)', () => {
      const result = selectMetric(makeInput({ activeCode: '4AA', holdingCompanyFlag: true }));
      expect(result.primaryMetric).toBe('forward_pe');
      expect(result.metricReason).toBe('bucket_4');
    });
  });

  // ── Bucket 5 ────────────────────────────────────────────────────────────────

  describe('Bucket 5', () => {
    it('5AA default → forward_ev_ebit', () => {
      const result = selectMetric(makeInput({ activeCode: '5AA' }));
      expect(result.primaryMetric).toBe('forward_ev_ebit');
      expect(result.metricReason).toBe('bucket_5');
    });

    it('5BA default → forward_ev_ebit', () => {
      const result = selectMetric(makeInput({ activeCode: '5BA' }));
      expect(result.primaryMetric).toBe('forward_ev_ebit');
      expect(result.metricReason).toBe('bucket_5');
    });

    it('5AA + preOperatingLeverageFlag=true → ev_sales', () => {
      const result = selectMetric(makeInput({ activeCode: '5AA', preOperatingLeverageFlag: true }));
      expect(result.primaryMetric).toBe('ev_sales');
      expect(result.metricReason).toBe('bucket_5_pre_op_leverage');
    });

    it('5BB + preOperatingLeverageFlag=true → ev_sales', () => {
      const result = selectMetric(makeInput({ activeCode: '5BB', preOperatingLeverageFlag: true }));
      expect(result.primaryMetric).toBe('ev_sales');
      expect(result.metricReason).toBe('bucket_5_pre_op_leverage');
    });
  });

  // ── Buckets 6–7: ev_sales ───────────────────────────────────────────────────

  describe('Buckets 6–7 → ev_sales', () => {
    const ev_sales_cases: Array<{ code: string; label: string }> = [
      { code: '6AA', label: 'bucket_6' },
      { code: '6BA', label: 'bucket_6' },
      { code: '6BB', label: 'bucket_6' },
      { code: '7AA', label: 'bucket_7' },
      { code: '7BA', label: 'bucket_7' },
    ];

    for (const { code, label } of ev_sales_cases) {
      it(`${code} → ev_sales with reason ${label}`, () => {
        const result = selectMetric(makeInput({ activeCode: code }));
        expect(result.primaryMetric).toBe('ev_sales');
        expect(result.metricReason).toBe(label);
      });
    }
  });

  // ── Bucket 8: no_stable_metric ──────────────────────────────────────────────

  describe('Bucket 8 → no_stable_metric', () => {
    it('8AA → no_stable_metric', () => {
      const result = selectMetric(makeInput({ activeCode: '8AA' }));
      expect(result.primaryMetric).toBe('no_stable_metric');
      expect(result.metricReason).toBe('bucket_8_binary');
    });

    it('8BA → no_stable_metric', () => {
      const result = selectMetric(makeInput({ activeCode: '8BA' }));
      expect(result.primaryMetric).toBe('no_stable_metric');
      expect(result.metricReason).toBe('bucket_8_binary');
    });
  });

  // ── primaryMetricOverride bypasses all logic ─────────────────────────────────

  describe('primaryMetricOverride', () => {
    it('override on bucket 1 code returns override metric', () => {
      const result = selectMetric(makeInput({
        activeCode: '1AA',
        primaryMetricOverride: 'ev_sales',
      }));
      expect(result.primaryMetric).toBe('ev_sales');
      expect(result.metricReason).toBe('primary_metric_override');
    });

    it('override on bucket 8 code bypasses no_stable_metric logic', () => {
      const result = selectMetric(makeInput({
        activeCode: '8AA',
        primaryMetricOverride: 'forward_pe',
      }));
      expect(result.primaryMetric).toBe('forward_pe');
      expect(result.metricReason).toBe('primary_metric_override');
    });

    it('override on bucket 6 code bypasses ev_sales default', () => {
      const result = selectMetric(makeInput({
        activeCode: '6AA',
        primaryMetricOverride: 'forward_ev_ebit',
      }));
      expect(result.primaryMetric).toBe('forward_ev_ebit');
      expect(result.metricReason).toBe('primary_metric_override');
    });

    it('override on 3AA with holdingCompanyFlag bypasses holding-company special case', () => {
      const result = selectMetric(makeInput({
        activeCode: '3AA',
        holdingCompanyFlag: true,
        primaryMetricOverride: 'forward_pe',
      }));
      expect(result.primaryMetric).toBe('forward_pe');
      expect(result.metricReason).toBe('primary_metric_override');
    });

    it('override on bucket 5 with preOpLev flag bypasses ev_sales special case', () => {
      const result = selectMetric(makeInput({
        activeCode: '5AA',
        preOperatingLeverageFlag: true,
        primaryMetricOverride: 'forward_ev_ebit',
      }));
      expect(result.primaryMetric).toBe('forward_ev_ebit');
      expect(result.metricReason).toBe('primary_metric_override');
    });

    it('override no_stable_metric is returned as-is', () => {
      const result = selectMetric(makeInput({
        activeCode: '3AA',
        primaryMetricOverride: 'no_stable_metric',
      }));
      expect(result.primaryMetric).toBe('no_stable_metric');
      expect(result.metricReason).toBe('primary_metric_override');
    });
  });
});
