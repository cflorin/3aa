// EPIC-004: Classification Engine & Universe Screen
// STORY-041: Bucket Scoring Algorithm
// TASK-041-005: Golden-set regression fixtures — captured from test DB 2026-04-24
//
// These fixtures lock the BucketScorer output for 5 known stocks.
// If ADR-013 scoring weights change, these tests will fail — that is intentional.
// Update this file only after deliberate weight recalibration and regression sign-off.
//
// Capture methodology:
//   1. Read each stock from test DB via Prisma
//   2. Convert growth fields: .toNumber() / 100 (DB stores percentage; ClassificationInput uses decimal fraction)
//   3. Convert ratio/margin fields: .toNumber() (DB stores decimal fraction; no conversion needed)
//   4. Run BucketScorer — record exact scores output
//
// ADR-013 (scoring weights); ADR-014 (confidence thresholds)

import type { ClassificationInput, BucketNumber } from '../../../../src/domain/classification/types';

// ── MSFT ─────────────────────────────────────────────────────────────────────
// winner=3 margin=1 missing=0 (B3 leads by 1; STORY-043 tie-break resolves final bucket)

export const MSFT_GOLDEN_INPUT: ClassificationInput = {
  revenue_growth_fwd: 0.0724,
  revenue_growth_3y: 0.1439,
  eps_growth_fwd: 0.0281,
  eps_growth_3y: 0.2118,
  gross_profit_growth: 0.1529,
  operating_margin: 0.49,
  fcf_margin: 0.39,
  fcf_conversion: 0.6491,
  roic: 0.2638,
  fcf_positive: true,
  net_income_positive: true,
  net_debt_to_ebitda: 0.22,
  interest_coverage: 56.44,
  moat_strength_score: 5,
  pricing_power_score: 4.5,
  revenue_recurrence_score: 4.5,
  margin_durability_score: 4.5,
  capital_intensity_score: 2,
  qualitative_cyclicality_score: 2,
  holding_company_flag: false,
  insurer_flag: false,
  cyclicality_flag: false,
  optionality_flag: false,
  binary_flag: false,
  pre_operating_leverage_flag: false,
};

export const MSFT_GOLDEN_SCORES: Record<BucketNumber, number> = {
  1: 0, 2: 2, 3: 8, 4: 7, 5: 4, 6: 3, 7: 0, 8: 0,
};

// ── ADBE ─────────────────────────────────────────────────────────────────────
// winner=4 margin=1 missing=0

export const ADBE_GOLDEN_INPUT: ClassificationInput = {
  revenue_growth_fwd: 0.0658,
  revenue_growth_3y: 0.1075,
  eps_growth_fwd: 0.3698,
  eps_growth_3y: 0.191,
  gross_profit_growth: 0.1126,
  operating_margin: 0.38,
  fcf_margin: 0.29,
  fcf_conversion: 1.4313,
  roic: 0.5893,
  fcf_positive: true,
  net_income_positive: true,
  net_debt_to_ebitda: 0.04,
  interest_coverage: 34.99,
  moat_strength_score: 4.5,
  pricing_power_score: 4,
  revenue_recurrence_score: 4.5,
  margin_durability_score: 4.5,
  capital_intensity_score: 1.5,
  qualitative_cyclicality_score: 2,
  holding_company_flag: false,
  insurer_flag: false,
  cyclicality_flag: false,
  optionality_flag: false,
  binary_flag: false,
  pre_operating_leverage_flag: false,
};

export const ADBE_GOLDEN_SCORES: Record<BucketNumber, number> = {
  1: 0, 2: 0, 3: 8, 4: 9, 5: 5, 6: 1, 7: 2, 8: 0,
};

// ── TSLA ─────────────────────────────────────────────────────────────────────
// winner=4 margin=1 missing=0

export const TSLA_GOLDEN_INPUT: ClassificationInput = {
  revenue_growth_fwd: 0.0881,
  revenue_growth_3y: 0.0519,
  eps_growth_fwd: 0.6435,
  eps_growth_3y: -0.336,
  gross_profit_growth: -0.0204,
  operating_margin: 0.06,
  fcf_margin: 0.04,
  fcf_conversion: 1.6394,
  roic: 0.0563,
  fcf_positive: true,
  net_income_positive: true,
  net_debt_to_ebitda: -1.46,
  interest_coverage: 16.43,
  moat_strength_score: 3.5,
  pricing_power_score: 2.5,
  revenue_recurrence_score: 2,
  margin_durability_score: 2.5,
  capital_intensity_score: 4.5,
  qualitative_cyclicality_score: 4.5,
  holding_company_flag: false,
  insurer_flag: false,
  cyclicality_flag: true,
  optionality_flag: false,
  binary_flag: false,
  pre_operating_leverage_flag: false,
};

export const TSLA_GOLDEN_SCORES: Record<BucketNumber, number> = {
  1: 3, 2: 0, 3: 5, 4: 6, 5: 2, 6: 1, 7: 2, 8: 0,
};

// ── UBER ─────────────────────────────────────────────────────────────────────
// winner=5 margin=1 missing=1 (eps_growth_3y null)

export const UBER_GOLDEN_INPUT: ClassificationInput = {
  revenue_growth_fwd: 0.1219,
  revenue_growth_3y: 0.1773,
  eps_growth_fwd: -0.3025,
  eps_growth_3y: null,
  gross_profit_growth: 0.1935,
  operating_margin: 0.12,
  fcf_margin: 0.19,
  fcf_conversion: 0.9712,
  roic: 0.1564,
  fcf_positive: true,
  net_income_positive: true,
  net_debt_to_ebitda: 0.4,
  interest_coverage: 13.97,
  moat_strength_score: 3.5,
  pricing_power_score: 2.5,
  revenue_recurrence_score: 2,
  margin_durability_score: 2.5,
  capital_intensity_score: 1.5,
  qualitative_cyclicality_score: 3.5,
  holding_company_flag: false,
  insurer_flag: false,
  cyclicality_flag: true,
  optionality_flag: false,
  binary_flag: false,
  pre_operating_leverage_flag: false,
};

export const UBER_GOLDEN_SCORES: Record<BucketNumber, number> = {
  1: 2, 2: 0, 3: 3, 4: 6, 5: 7, 6: 4, 7: 0, 8: 0,
};

// ── UNH ──────────────────────────────────────────────────────────────────────
// winner=1 margin=0 missing=0
// NOTE: UNH has negative revenue and profit growth in current snapshot (2026-04-24),
// causing B1 to tie with B4 at 6 pts. B1 wins by position. STORY-043 tie-break
// between B1 and B4 will apply (no specific tie-break rule defined for 1v4; conservative
// default resolves to B1). Expected classification = B3 under normal conditions.
// Lock against this snapshot; update when UNH fundamentals normalize.

export const UNH_GOLDEN_INPUT: ClassificationInput = {
  revenue_growth_fwd: -0.0158,
  revenue_growth_3y: 0.1135,
  eps_growth_fwd: 0.3468,
  eps_growth_3y: -0.1485,
  gross_profit_growth: -0.0725,
  operating_margin: 0.04,
  fcf_margin: 0.03,
  fcf_conversion: 1.3334,
  roic: 0.0909,
  fcf_positive: true,
  net_income_positive: true,
  net_debt_to_ebitda: 3.01,
  interest_coverage: 4.48,
  moat_strength_score: 4,
  pricing_power_score: 3.5,
  revenue_recurrence_score: 4.5,
  margin_durability_score: 3.5,
  capital_intensity_score: 1.5,
  qualitative_cyclicality_score: 1.5,
  holding_company_flag: false,
  insurer_flag: false,
  cyclicality_flag: false,
  optionality_flag: false,
  binary_flag: false,
  pre_operating_leverage_flag: false,
};

export const UNH_GOLDEN_SCORES: Record<BucketNumber, number> = {
  1: 6, 2: 0, 3: 4, 4: 6, 5: 2, 6: 2, 7: 0, 8: 0,
};
