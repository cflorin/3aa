// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-005: SecondaryAdjustments — gross margin, dilution, cyclicality
// Source: docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 5

import type { MetricFamily, PrimaryMetric, ThresholdAdjustment } from './types';
import { parseBucket } from './metric-selector';

export interface AdjustmentInput {
  activeCode: string;
  metricFamily: MetricFamily;
  primaryMetric: PrimaryMetric;
  maxThreshold: number | null;
  comfortableThreshold: number | null;
  veryGoodThreshold: number | null;
  stealThreshold: number | null;
  grossMargin?: number | null;           // decimal: 0.75 = 75%
  shareCountGrowth3y?: number | null;    // decimal: 0.05 = 5%
  materialDilutionFlag?: boolean;
  cyclicalityFlag?: boolean;
}

export interface AdjustmentResult {
  maxThreshold: number | null;
  comfortableThreshold: number | null;
  veryGoodThreshold: number | null;
  stealThreshold: number | null;
  thresholdAdjustments: ThresholdAdjustment[];
  grossMarginAdjustmentApplied: boolean;
  dilutionAdjustmentApplied: boolean;
  cyclicalityContextFlag: boolean;
}

const EV_SALES_FLOOR = 0.5;
const PE_EBIT_FLOOR = 1.0;

function applyDelta(
  vals: [number | null, number | null, number | null, number | null],
  delta: number,
  floor: number,
): [number | null, number | null, number | null, number | null] {
  return vals.map(v => {
    if (v === null) return null;
    return Math.max(Math.round((v + delta) * 100) / 100, floor);
  }) as [number | null, number | null, number | null, number | null];
}

export function applySecondaryAdjustments(input: AdjustmentInput): AdjustmentResult {
  const bucket = parseBucket(input.activeCode);
  const adjustments: ThresholdAdjustment[] = [];

  let [max, comfortable, veryGood, steal] = [
    input.maxThreshold,
    input.comfortableThreshold,
    input.veryGoodThreshold,
    input.stealThreshold,
  ];

  let grossMarginApplied = false;
  let dilutionApplied = false;
  const cyclicalityContextFlag = input.cyclicalityFlag === true;

  const isEvSalesMetric = input.metricFamily === 'ev_sales';
  const floor = isEvSalesMetric ? EV_SALES_FLOOR : PE_EBIT_FLOOR;

  // §5.1 Gross margin adjustment: B6 and B7 with ev_sales metric only
  if ((bucket === 6 || bucket === 7) && isEvSalesMetric && input.grossMargin != null) {
    const gm = input.grossMargin;
    let delta = 0;
    let reason = '';

    if (gm > 0.80) {
      delta = +1.0;
      reason = 'gross_margin_above_80pct';
    } else if (gm < 0.60) {
      delta = -1.5;
      reason = 'gross_margin_below_60pct';
    }

    if (delta !== 0) {
      [max, comfortable, veryGood, steal] = applyDelta([max, comfortable, veryGood, steal], delta, floor);
      adjustments.push({ type: 'gross_margin', delta, reason });
      grossMarginApplied = true;
    }
  }

  // §5.3 Dilution adjustment: B5, B6, B7
  if (bucket >= 5 && bucket <= 7) {
    const dilutionTriggered =
      (input.shareCountGrowth3y != null && input.shareCountGrowth3y > 0.05) ||
      input.materialDilutionFlag === true;

    if (dilutionTriggered) {
      const delta = isEvSalesMetric ? -1.0 : -1.0; // -1 turn for P/E+EV/EBIT, -1.0x for EV/Sales
      [max, comfortable, veryGood, steal] = applyDelta([max, comfortable, veryGood, steal], delta, floor);
      adjustments.push({
        type: 'dilution',
        delta,
        reason: input.materialDilutionFlag ? 'material_dilution_flag' : 'share_count_growth_above_5pct',
      });
      dilutionApplied = true;
    }
  }

  return {
    maxThreshold: max,
    comfortableThreshold: comfortable,
    veryGoodThreshold: veryGood,
    stealThreshold: steal,
    thresholdAdjustments: adjustments,
    grossMarginAdjustmentApplied: grossMarginApplied,
    dilutionAdjustmentApplied: dilutionApplied,
    cyclicalityContextFlag,
  };
}
