// EPIC-004: Classification Engine & Universe Screen
// STORY-041: Bucket Scoring Algorithm
// TASK-041-001: ADR-013 scoring weight constants
// ADR-013: Classification Scoring Algorithm Weights

// Bucket scorer weights (integer points added per rule fired)
export const REV_PRIMARY = 3;           // revenue_growth_fwd in primary bucket range
export const REV_SECONDARY = 2;         // revenue_growth_3y or gross_profit_growth (same ranges)
export const EPS_PRIMARY = 2;           // eps_growth_fwd in bucket-aligned range
export const EPS_SECONDARY = 1;         // eps_growth_3y in same range
export const PROFITABILITY = 1;         // operating_margin or fcf_positive or net_income_positive
export const FCF_CONVERSION_WEIGHT = 1; // fcf_conversion above threshold for Buckets 3/4
export const FLAG_PRIMARY = 2;          // pre_operating_leverage_flag → Bucket 5
export const ENRICHMENT_BONUS = 1;      // E1/E5/E6 enrichment bonus (threshold ≥ 4.0)

// EQ scorer weights (STORY-042)
export const EQ_FCF_STRONG = 3;     // fcf_conversion > 0.80 → +3 to A
export const EQ_FCF_MODERATE = 2;   // fcf_conversion [0.50, 0.80] → +2 to B
export const EQ_FCF_WEAK = 2;       // fcf_conversion < 0.50 or fcf_positive=false → +2 to C
export const EQ_MOAT_STRONG = 2;    // moat_strength_score ≥ 4.0 → +2 to A
export const EQ_MOAT_MODERATE = 1;  // moat_strength_score [2.5, 4.0) → +1 to B
export const EQ_MOAT_WEAK = 1;      // moat_strength_score < 2.5 → +1 to C
export const EQ_NI_POSITIVE = 1;    // net_income_positive = true → +1 to A and +1 to B
// [BUG-CE-002] E2/E3/E4 enrichment weights — same pattern as moat (STORY-042 gap)
export const EQ_PRICING_STRONG = 2;      // pricing_power_score ≥ 4.0 → +2 to A
export const EQ_PRICING_MODERATE = 1;   // pricing_power_score [2.5, 4.0) → +1 to B
export const EQ_PRICING_WEAK = 1;       // pricing_power_score < 2.5 → +1 to C
export const EQ_RECURRENCE_STRONG = 2;  // revenue_recurrence_score ≥ 4.0 → +2 to A
export const EQ_RECURRENCE_MODERATE = 1;// revenue_recurrence_score [2.5, 4.0) → +1 to B
export const EQ_RECURRENCE_WEAK = 1;    // revenue_recurrence_score < 2.5 → +1 to C
export const EQ_MARGIN_DUR_STRONG = 2;  // margin_durability_score ≥ 4.0 → +2 to A
export const EQ_MARGIN_DUR_MODERATE = 1;// margin_durability_score [2.5, 4.0) → +1 to B
export const EQ_MARGIN_DUR_WEAK = 1;    // margin_durability_score < 2.5 → +1 to C

// BS scorer weights (STORY-042)
export const BS_DEBT_LOW = 3;          // net_debt_to_ebitda < 1.0 strict → +3 to A
export const BS_DEBT_MODERATE = 2;     // net_debt_to_ebitda [1.0, 2.5] → +2 to B
// [ADR-013 amendment 2026-04-25] raised 2→3: high leverage must outweigh strong coverage so
// high-debt companies cannot tie-break to BS-A via coverage alone (C:3 > A:2 at all times).
export const BS_DEBT_HIGH = 3;         // net_debt_to_ebitda > 2.5 → +3 to C
export const BS_COVERAGE_STRONG = 2;   // interest_coverage > 12.0 → +2 to A
export const BS_COVERAGE_MODERATE = 1; // interest_coverage [5.0, 12.0] → +1 to B
export const BS_COVERAGE_WEAK = 2;     // interest_coverage < 5.0 → +2 to C
export const BS_CAPITAL_INTENSITY = 1; // capital_intensity_score ≥ 4.0 → +1 to C
export const BS_NET_CASH_BONUS = 1;    // net_debt_to_ebitda ≤ 0 (net cash) → +1 to A (stacks with DEBT_LOW)
