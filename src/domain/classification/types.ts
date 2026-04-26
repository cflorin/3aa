// EPIC-004: Classification Engine & Universe Screen
// STORY-041: Bucket Scoring Algorithm
// TASK-041-001: ClassificationInput interface and BucketScorerOutput interface
// STORY-043: TASK-043-001: ClassificationResult, ConfidenceStep, TieBreakRecord interfaces
// STORY-044: TASK-044-003: ClassificationState, ClassificationHistoryRow interfaces
// STORY-065: ClassificationTrendMetrics, RecomputeTrigger
// RFC-001 §ClassificationResult, §Classification State, §Classification History; ADR-013; ADR-014
// RFC-001 Amendment 2026-04-25: ClassificationTrendMetrics; ADR-016 §shouldRecompute Extension

// ── Quarterly trend metrics (from stock_derived_metrics) — all optional ──────
// STORY-065: Populated by toClassificationInput when a stock_derived_metrics row exists.
export interface ClassificationTrendMetrics {
  quartersAvailable?: number | null;
  // TTM rollups
  revenueTtm?: number | null;
  grossProfitTtm?: number | null;
  operatingIncomeTtm?: number | null;
  netIncomeTtm?: number | null;
  capexTtm?: number | null;
  cashFromOperationsTtm?: number | null;
  freeCashFlowTtm?: number | null;
  shareBasedCompensationTtm?: number | null;
  depreciationAndAmortizationTtm?: number | null;
  // TTM margin ratios
  grossMarginTtm?: number | null;
  operatingMarginTtm?: number | null;
  netMarginTtm?: number | null;
  fcfMarginTtm?: number | null;
  sbcAsPctRevenueTtm?: number | null;
  cfoToNetIncomeRatioTtm?: number | null;
  // Trajectory slopes (pp per quarter)
  grossMarginSlope4q?: number | null;
  operatingMarginSlope4q?: number | null;
  netMarginSlope4q?: number | null;
  grossMarginSlope8q?: number | null;
  operatingMarginSlope8q?: number | null;
  netMarginSlope8q?: number | null;
  // Stability scores [0, 1]
  operatingMarginStabilityScore?: number | null;
  grossMarginStabilityScore?: number | null;
  netMarginStabilityScore?: number | null;
  // Operating leverage
  operatingLeverageRatio?: number | null;
  operatingIncomeAccelerationFlag?: boolean | null;
  operatingLeverageEmergingFlag?: boolean | null;
  // Earnings quality
  earningsQualityTrendScore?: number | null;
  deterioratingCashConversionFlag?: boolean | null;
  // Dilution & SBC
  dilutedSharesOutstandingChange4q?: number | null;
  dilutedSharesOutstandingChange8q?: number | null;
  materialDilutionTrendFlag?: boolean | null;
  sbcBurdenScore?: number | null;
  // Capital intensity
  capexToRevenueRatioAvg4q?: number | null;
  capexIntensityIncreasingFlag?: boolean | null;
}

// Identifies WHY a classification recompute was triggered — STORY-065; ADR-016
export type RecomputeTrigger = 'fundamental_change' | 'flag_change' | 'quarterly_data_updated';

// All numeric fields stored as decimal fractions (0.10 = 10%). Mirrors Prisma @map() names.
export interface ClassificationInput {
  // Growth fundamentals — decimal fractions; null = not available
  revenue_growth_fwd: number | null;
  revenue_growth_3y: number | null;
  eps_growth_fwd: number | null;
  eps_growth_3y: number | null;
  gross_profit_growth: number | null;

  // Profitability
  operating_margin: number | null;
  fcf_margin: number | null;
  fcf_conversion: number | null;
  roic: number | null;

  // Binary profitability flags
  fcf_positive: boolean | null;
  net_income_positive: boolean | null;

  // Balance sheet
  net_debt_to_ebitda: number | null;
  interest_coverage: number | null;

  // Enrichment scores (E1–E6); decimal 1.0–5.0 in half-integer steps
  moat_strength_score: number | null;
  pricing_power_score: number | null;
  revenue_recurrence_score: number | null;
  margin_durability_score: number | null;
  capital_intensity_score: number | null;
  qualitative_cyclicality_score: number | null;

  // Classification flags
  holding_company_flag: boolean | null;
  insurer_flag: boolean | null;
  cyclicality_flag: boolean | null;
  optionality_flag: boolean | null;
  binary_flag: boolean | null;
  pre_operating_leverage_flag: boolean | null;

  // Optional quarterly trend metrics — populated when stock_derived_metrics row exists (STORY-065)
  trend_metrics?: ClassificationTrendMetrics;
}

export type BucketNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type GradeLevel = 'A' | 'B' | 'C';

export interface BucketScorerOutput {
  scores: Record<BucketNumber, number>;
  winner: BucketNumber | null;   // highest-scoring bucket; null when all scores = 0
  margin: number;                 // winner_score - second_highest_score; 0 when no winner
  reason_codes: string[];
  missing_field_count: number;    // count of CRITICAL_FIELDS that are null/undefined
}

export interface GradeScorerOutput {
  scores: Record<GradeLevel, number>;
  winner: GradeLevel | null;       // highest-scoring grade; null when all scores = 0
  reason_codes: string[];
  missing_field_count: number;     // count of scorer-relevant fundamental fields that are null
}

// One entry per ADR-014 confidence derivation step; populated for every classifyStock call
export interface ConfidenceStep {
  step: number;
  label: string;
  note: string;
  band: 'high' | 'medium' | 'low';
  tieBreaks?: number;
  missing?: number;
}

// Records a single tie-break evaluation that fired during classifyStock
export interface TieBreakRecord {
  rule: string;                           // e.g. "3v4", "4v5"
  description: string;                    // human-readable explanation
  winner: number | string;               // resolved bucket number
  condition: string;                      // text of the deciding condition
  values: Record<string, number | null>; // actual input values tested
  outcome: string;                        // e.g. "Bucket 4 chosen: strong FCF and ROIC"
  marginAtTrigger: number;               // BucketScorer margin when this rule fired
}

// Full output of classifyStock — consumed by STORY-044 persistence and STORY-045+ query functions
// RFC-001 §ClassificationResult; ADR-014 §Confidence Computation
// STORY-083: rawSuggestedCode / rawConfidenceLevel / confidenceFloorApplied added for confidence-floor audit
export interface ClassificationResult {
  suggested_code: string | null;                // "4AA", "8", or null when data too sparse (post-floor)
  bucket: BucketNumber | null;                  // null only when missing_field_count > 5 (post-floor)
  eq_grade: GradeLevel | null;                  // null for Bucket 8 or all-null EQ input
  bs_grade: GradeLevel | null;                  // null for Bucket 8 or all-null BS input
  confidence_level: 'high' | 'medium' | 'low'; // NEVER null (ADR-014 §Confidence invariant); post-floor
  reason_codes: string[];                       // union of all scorer + tie-break + flag codes
  scores: {
    bucket: Record<BucketNumber, number>;
    eq: Record<GradeLevel, number>;
    bs: Record<GradeLevel, number>;
  };
  missing_field_count: number;
  confidenceBreakdown: { steps: ConfidenceStep[] }; // always ≥ 1 step
  tieBreaksFired: TieBreakRecord[];               // empty array (never null) when no tie-breaks
  // STORY-083: confidence-floor audit fields (present only when floor search was applied)
  rawSuggestedCode?: string | null;             // pre-floor code (same as suggested_code when no floor applied)
  rawConfidenceLevel?: 'low' | null;            // always 'low' when confidenceFloorApplied is true
  confidenceFloorApplied?: boolean;             // true when floor search changed the final bucket
}

// ── STORY-044: Persistence types ─────────────────────────────────────────────
// RFC-001 §Classification State; ADR-007 (hybrid shared/per-user state)

// Shape of the `scores` JSONB column in classification_state — combines scorer outputs + audit trail
// STORY-083: rawSuggestedCode / rawConfidenceLevel / confidenceFloorApplied added (no migration needed — JSONB)
export interface ClassificationScoresPayload {
  bucket: Record<BucketNumber, number>;
  eq: Record<GradeLevel, number>;
  bs: Record<GradeLevel, number>;
  confidenceBreakdown: { steps: ConfidenceStep[] };
  tieBreaksFired: TieBreakRecord[];
  rawSuggestedCode?: string | null;   // pre-floor code; present only when floor was applied
  rawConfidenceLevel?: 'low' | null;  // always 'low' when confidenceFloorApplied is true
  confidenceFloorApplied?: boolean;   // true when floor search changed the bucket
}

// Hydrated row from classification_state (one per ticker, system-wide)
export interface ClassificationState {
  ticker: string;
  suggested_code: string | null;
  confidence_level: 'high' | 'medium' | 'low';
  reason_codes: string[];
  scores: ClassificationScoresPayload;
  input_snapshot: ClassificationInput;
  classified_at: Date;
  updated_at: Date;
}

// Hydrated row from classification_history (append-only audit log)
export interface ClassificationHistoryRow {
  id: string;
  ticker: string;
  old_suggested_code: string | null;
  new_suggested_code: string | null;
  context_snapshot: {
    input_snapshot: ClassificationInput;
    scores: ClassificationResult['scores'];
    reason_codes: string[];
  };
  classified_at: Date;
}
