// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-002: MetricSelector — bucket + flags → primary_metric, metric_reason
// Source: docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 1

import type { PrimaryMetric, ValuationInput } from './types';

export interface MetricSelectionResult {
  primaryMetric: PrimaryMetric;
  metricReason: string;
}

export function selectMetric(input: ValuationInput): MetricSelectionResult {
  const bucket = parseBucket(input.activeCode);

  // Manual override bypasses all selection logic
  if (input.primaryMetricOverride) {
    return {
      primaryMetric: input.primaryMetricOverride,
      metricReason: 'primary_metric_override',
    };
  }

  // Bucket 8 — binary / lottery
  if (bucket === 8) {
    return { primaryMetric: 'no_stable_metric', metricReason: 'bucket_8_binary' };
  }

  // Buckets 1–4
  if (bucket >= 1 && bucket <= 4) {
    // 3AA exception: holding company / insurer uses operating earnings ex excess cash
    if (
      (input.holdingCompanyFlag || input.insurerFlag) &&
      bucket === 3 &&
      input.activeCode === '3AA'
    ) {
      return {
        primaryMetric: 'forward_operating_earnings_ex_excess_cash',
        metricReason: 'bucket_3AA_holding_company',
      };
    }
    return { primaryMetric: 'forward_pe', metricReason: `bucket_${bucket}` };
  }

  // Bucket 5 — operating leverage
  if (bucket === 5) {
    if (input.preOperatingLeverageFlag) {
      return { primaryMetric: 'ev_sales', metricReason: 'bucket_5_pre_op_leverage' };
    }
    return { primaryMetric: 'forward_ev_ebit', metricReason: 'bucket_5' };
  }

  // Buckets 6–7
  if (bucket === 6 || bucket === 7) {
    return { primaryMetric: 'ev_sales', metricReason: `bucket_${bucket}` };
  }

  // Fallback — should not reach here with valid code
  return { primaryMetric: 'no_stable_metric', metricReason: 'unknown_bucket' };
}

export function parseBucket(code: string): number {
  return parseInt(code.charAt(0), 10);
}
