// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-001: ValuationInput, ValuationResult, and supporting types
// EPIC-008/STORY-089/TASK-089-005: Added ValuationRegime, CyclePosition, GrowthTier,
//   updated ValuationStateStatus to 5-state canonical vocab, added ValuationRegimeThresholdRow

// ── EPIC-008: Valuation Regime types ─────────────────────────────────────────

export type ValuationRegime =
  | 'not_applicable'
  | 'financial_special_case'
  | 'manual_required'
  | 'sales_growth_standard'
  | 'sales_growth_hyper'
  | 'profitable_growth_pe'
  | 'cyclical_earnings'
  | 'profitable_growth_ev_ebit'
  | 'mature_pe';

// depressed/elevated/peak/normal are inferred from quarterly metrics; conservative bias required
export type CyclePosition = 'depressed' | 'normal' | 'elevated' | 'peak' | 'insufficient_data';

export type GrowthTier = 'high' | 'mid' | 'standard';

// Injected from valuation_regime_thresholds DB table (9 rows, one per ValuationRegime)
// profitable_growth_pe row = high-tier base; mid/standard tiers are runtime constants
export interface ValuationRegimeThresholdRow {
  regime: string;
  primaryMetric: string;
  maxThreshold: number | null;
  comfortableThreshold: number | null;
  veryGoodThreshold: number | null;
  stealThreshold: number | null;
}

// ── EPIC-008/STORY-092: RegimeSelectorInput ──────────────────────────────────

export interface RegimeSelectorInput {
  activeCode: string;                 // used to extract bucket
  bankFlag: boolean;
  insurerFlag: boolean;
  holdingCompanyFlag: boolean;
  preOperatingLeverageFlag: boolean;
  netIncomeTtm: number | null;
  freeCashFlowTtm: number | null;
  operatingMarginTtm: number | null;
  grossMarginTtm: number | null;
  fcfConversionTtm: number | null;   // freeCashFlowTtm / netIncomeTtm (pre-computed)
  revenueGrowthFwd: number | null;
  structuralCyclicalityScore: number; // 0–3
}

export type ValuationZone =
  | 'steal_zone'
  | 'very_good_zone'
  | 'comfortable_zone'
  | 'max_zone'
  | 'above_max'
  | 'not_applicable';

// Canonical 5-state vocabulary (EPIC-008/STORY-089/TASK-089-005, ADR-017).
// 'ready' is eliminated — backward-compat read guards treat 'ready' as 'computed'.
// 'missing_data' and 'manual_required_insurer' are consolidated into 'manual_required'.
export type ValuationStateStatus =
  | 'classification_required'
  | 'not_applicable'
  | 'manual_required'
  | 'computed'
  | 'stale';

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
  /** @deprecated Use valuationRegimeThresholds instead (EPIC-008). Retained for legacy callers only. */
  anchoredThresholds: AnchoredThresholdRow[];
  tsrHurdles: TsrHurdleRow[];

  // EPIC-008/STORY-093: Regime-driven inputs (injected by loadValuationInput + selectRegime)
  // These are optional for backward compat; when present, regime-driven path is used.
  netIncomeTtm?: number | null;
  freeCashFlowTtm?: number | null;
  operatingMarginTtm?: number | null;
  grossMarginTtm?: number | null;
  fcfConversionTtm?: number | null;
  revenueGrowthFwd?: number | null;
  bankFlag?: boolean;
  // Pre-computed by CyclicalScoreService, read from stock table
  structuralCyclicalityScore?: number;   // 0–3
  cyclePosition?: CyclePosition;
  cyclicalConfidence?: 'high' | 'medium' | 'low' | 'insufficient_data';
  // Pre-computed by selectRegime(), injected by computeValuation()
  valuationRegime?: ValuationRegime;
  // Replaces anchoredThresholds when valuationRegime is set
  valuationRegimeThresholds?: ValuationRegimeThresholdRow[];
}

export interface ThresholdAdjustment {
  type: 'gross_margin' | 'dilution' | 'cyclical_warning';
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

  // EPIC-008/STORY-093: Regime-driven output fields (null when legacy path used)
  valuationRegime?: ValuationRegime | null;
  growthTier?: GrowthTier | null;
  structuralCyclicalityScoreSnapshot?: number | null;
  cyclePositionSnapshot?: CyclePosition | null;
  cyclicalOverlayApplied?: boolean | null;
  cyclicalOverlayValue?: number | null;
  cyclicalConfidence?: 'high' | 'medium' | 'low' | 'insufficient_data' | null;
  // thresholdFamily replaces derivedFromCode as primary label; derivedFromCode retained for backward compat
  thresholdFamily?: string | null;
}
