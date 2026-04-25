// EPIC-004: Classification Engine & Universe Screen
// STORY-042: Earnings Quality and Balance Sheet Quality Scoring
// TASK-042-005: Golden-set regression fixtures for EarningsQualityScorer and BalanceSheetQualityScorer
//
// These values were captured by running the scorers against the inputs below and locked as
// regression anchors. Any weight change in ADR-013 will cause these tests to fail intentionally.
//
// Unit test inputs (fixed, not from test DB — see integration tests for live DB data):
//   MSFT-like EQ: fcf_conversion=1.43, moat_strength_score=5.0, net_income_positive=true, fcf_positive=true
//   MSFT-like BS: net_debt_to_ebitda=0.22, interest_coverage=56.4
//   UNH-like EQ:  fcf_conversion=0.97, moat_strength_score=4.0, net_income_positive=true, fcf_positive=true
//   UNH-like BS:  net_debt_to_ebitda=3.01, interest_coverage=4.48

// MSFT EQ: FCF_STRONG(2) + MOAT_STRONG(2) + NI_A(1) = A:5; NI_B(1) = B:1; C:0  [ADR-013 amendment 2026-04-25]
export const MSFT_EQ_GOLDEN_SCORES = { A: 5, B: 1, C: 0 } as const;

// MSFT BS: DEBT_LOW(3) + COVERAGE_STRONG(2) = A:5; B:0; C:0
export const MSFT_BS_GOLDEN_SCORES = { A: 5, B: 0, C: 0 } as const;

// UNH EQ (representative: FCF_STRONG + MOAT_STRONG + NI):
// FCF_STRONG(2) + MOAT_STRONG(2) + NI_A(1) = A:5; NI_B(1) = B:1; C:0  [ADR-013 amendment 2026-04-25]
export const UNH_EQ_GOLDEN_SCORES = { A: 5, B: 1, C: 0 } as const;

// UNH BS: DEBT_HIGH(3) + COVERAGE_WEAK(2) = A:0; B:0; C:5  [ADR-013 amendment 2026-04-25]
export const UNH_BS_GOLDEN_SCORES = { A: 0, B: 0, C: 5 } as const;
