// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-001: ValuationInput, ValuationResult, and supporting types

export type ValuationZone =
  | 'steal_zone'
  | 'very_good_zone'
  | 'comfortable_zone'
  | 'max_zone'
  | 'above_max'
  | 'not_applicable';

export type ValuationStateStatus =
  | 'ready'
  | 'manual_required'
  | 'manual_required_insurer'
  | 'classification_required'
  | 'not_applicable'
  | 'missing_data';

export type PrimaryMetric =
  | 'forward_pe'
  | 'forward_ev_ebit'
  | 'ev_sales'
  | 'forward_operating_earnings_ex_excess_cash'
  | 'no_stable_metric';

export type ThresholdSource = 'anchored' | 'derived' | 'manual_override';

export type MetricFamily = 'pe' | 'ev_ebit' | 'ev_sales';

// Injected from anchored_thresholds DB table
export interface AnchoredThresholdRow {
  code: string;
  bucket: number;
  earningsQuality: string;   // 'A' | 'B' | 'C'
  balanceSheetQuality: string;
  primaryMetric: string;
  maxThreshold: number;
  comfortableThreshold: number;
  veryGoodThreshold: number;
  stealThreshold: number;
}

// Injected from tsr_hurdles DB table
export interface TsrHurdleRow {
  bucket: number;
  baseHurdleLabel: string;
  baseHurdleDefault: number | null;
  earningsQualityAAdjustment: number;
  earningsQualityBAdjustment: number;
  earningsQualityCAdjustment: number;
  balanceSheetAAdjustment: number;
  balanceSheetBAdjustment: number;
  balanceSheetCAdjustment: number;
}

export interface ValuationInput {
  // Resolved active code: final_code if user has override, else suggested_code
  activeCode: string;

  // STORY-082: Classification confidence — drives effective bucket demotion (RFC-003 §Confidence-Based Effective Bucket)
  confidenceLevel?: 'high' | 'medium' | 'low' | null;

  // Optional manual overrides (applied by caller before passing in)
  primaryMetricOverride?: PrimaryMetric;
  forwardOperatingEarningsExExcessCash?: number | null;

  // Stock fundamentals
  forwardPe?: number | null;
  forwardEvEbit?: number | null;
  evSales?: number | null;
  grossMargin?: number | null;        // decimal (0.75 = 75%)
  shareCountGrowth3y?: number | null; // decimal (0.05 = 5%)
  materialDilutionFlag?: boolean;
  trailingPe?: number | null;
  trailingEvEbit?: number | null;
  epsGrowthFwd?: number | null;       // decimal

  // Classification flags
  cyclicalityFlag?: boolean;
  holdingCompanyFlag?: boolean;
  insurerFlag?: boolean;
  preOperatingLeverageFlag?: boolean;

  // Injected from DB (not fetched inside domain)
  anchoredThresholds: AnchoredThresholdRow[];
  tsrHurdles: TsrHurdleRow[];
}

export interface ThresholdAdjustment {
  type: 'gross_margin' | 'dilution';
  delta: number;
  reason: string;
}

export interface ValuationResult {
  activeCode: string;
  // STORY-082: effectiveCode may differ from activeCode when confidence is low (bucket demoted by 1)
  effectiveCode: string;
  primaryMetric: PrimaryMetric;
  metricReason: string;

  currentMultiple: number | null;
  currentMultipleBasis: string;         // 'spot' | 'trailing_fallback'
  metricSource: string;                 // e.g. 'forward_pe' | 'fallback_trailing_pe'

  maxThreshold: number | null;
  comfortableThreshold: number | null;
  veryGoodThreshold: number | null;
  stealThreshold: number | null;
  thresholdSource: ThresholdSource;
  derivedFromCode: string | null;
  thresholdAdjustments: ThresholdAdjustment[];

  baseTsrHurdleLabel: string | null;
  baseTsrHurdleDefault: number | null;
  adjustedTsrHurdle: number | null;
  hurdleSource: string;                 // 'default' | 'manual_override'
  tsrReasonCodes: string[];

  valuationZone: ValuationZone;
  valuationStateStatus: ValuationStateStatus;

  grossMarginAdjustmentApplied: boolean;
  dilutionAdjustmentApplied: boolean;
  cyclicalityContextFlag: boolean;
}
