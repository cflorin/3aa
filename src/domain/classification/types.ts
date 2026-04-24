// EPIC-004: Classification Engine & Universe Screen
// STORY-041: Bucket Scoring Algorithm
// TASK-041-001: ClassificationInput interface and BucketScorerOutput interface
// RFC-001 §ClassificationResult; ADR-013 (scoring weights); ADR-014 (confidence thresholds)

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
  winner: GradeLevel | null;
  reason_codes: string[];
}
