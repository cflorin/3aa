// EPIC-004: Classification Engine & Universe Screen
// STORY-043: Classification Result Assembly (Tie-Break, Confidence, Special Cases)
// TASK-043-004: Golden-set regression fixtures for classifyStock
//
// These values were derived analytically from the bucket-scorer-golden.ts inputs and
// locked as regression anchors. Any change to tie-break rules, override logic, or ADR-013/014
// thresholds will cause these tests to fail intentionally.
//
// Derivation (per stock):
//   1. Run BucketScorer on GOLDEN_INPUT → get scores, winner, margin
//   2. Apply tie-break rules (priority order: 4v5, 5v6, 3v4, 6v7)
//   3. Apply special-case overrides
//   4. Run EQ and BS scorers → get grades
//   5. Compute confidence (margin, tie_break_count, missing_field_count)
//
// Source inputs: tests/unit/classification/fixtures/bucket-scorer-golden.ts

import type { BucketNumber, GradeLevel } from '../../../../src/domain/classification/types';

export interface ClassifyGolden {
  bucket: BucketNumber | null;
  eq_grade: GradeLevel | null;
  bs_grade: GradeLevel | null;
  confidence_level: 'high' | 'medium' | 'low';
  suggested_code: string | null;
}

// MSFT: BucketScorer winner=3, margin=1 → 3v4 tie fires
// 3v4 rule: fcf_conversion=0.6491 ≤ 0.85 → B3 wins (conservative)
// EQ: FCF_STRONG(1.4313>0.80=no; wait: 0.6491>0.80? NO → EQ_FCF_MODERATE to B) wait re-check
// MSFT fcf_conversion=0.6491: > 0.80? NO. [0.50, 0.80]? YES (0.50 ≤ 0.6491 ≤ 0.80) → EQ-B +2
// moat=5.0 ≥ 4.0 → EQ-A +2; NI=true → A+1, B+1
// EQ: A=2+1=3, B=2+1=3 → tied; A>B preference → winner=A
// BS: net_debt=0.22 < 1.0 → A+3; coverage=56.44 > 12 → A+2. A=5, winner=A
// Confidence: margin=1 → 'low'; 1 tie-break → degrade → 'low'; missing=0 → no change. Final='low'
export const MSFT_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 3,
  eq_grade: 'A',   // tied A=3, B=3; A>B preference
  bs_grade: 'A',
  confidence_level: 'low',
  suggested_code: '3AA',
};

// ADBE: BucketScorer winner=4, margin=1 → 3v4 tie fires
// 3v4 rule: fcf_conversion=1.4313 > 0.85 AND roic=0.5893 > 0.20 → B4 wins
// EQ: 1.4313 > 0.80 → EQ-A +3; moat=4.5 ≥ 4.0 → EQ-A +2; NI=true → A+1, B+1. A=6, B=1, winner=A
// BS: net_debt=0.04 < 1.0 → A+3; coverage=34.99 > 12 → A+2. A=5, winner=A
// Confidence: margin=1→'low'; 1 tie→degrade→'low'; missing=0. Final='low'
export const ADBE_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 4,
  eq_grade: 'A',
  bs_grade: 'A',
  confidence_level: 'low',
  suggested_code: '4AA',
};

// TSLA: BucketScorer winner=4, margin=1 → 3v4 tie fires
// 3v4 rule: fcf_conversion=1.6394 > 0.85 ✓ BUT roic=0.0563 ≤ 0.20 → B3 wins (conservative)
// EQ: 1.6394 > 0.80 → A+3; moat=3.5 in [2.5,4.0) → B+1; NI=true → A+1, B+1. A=4, B=2, winner=A
// BS: net_debt=-1.46 < 1.0 → A+3; ≤0 → net_cash_bonus +1; coverage=16.43 > 12 → A+2. A=6, winner=A
// Confidence: margin=1→'low'; 1 tie→degrade→'low'; missing=0. Final='low'
export const TSLA_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 3,
  eq_grade: 'A',
  bs_grade: 'A',
  confidence_level: 'low',
  suggested_code: '3AA',
};

// UBER: BucketScorer winner=5, margin=1 → 4v5 tie fires
// 4v5 rule: pre_operating_leverage_flag=false → B4 wins
// EQ: fcf_conversion=0.9712 > 0.80 → A+3; moat=3.5 in [2.5,4.0) → B+1; NI=true → A+1, B+1. A=4, B=2, winner=A
// BS: net_debt=0.40 < 1.0 → A+3; coverage=13.97 > 12 → A+2. A=5, winner=A
// Confidence: margin=1→'low'; 1 tie→degrade→'low'; missing=1 (eps_3y null) → no penalty (1<3). Final='low'
export const UBER_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 4,
  eq_grade: 'A',
  bs_grade: 'A',
  confidence_level: 'low',
  suggested_code: '4AA',
};

// UNH: BucketScorer winner=1, margin=0 (B1=B4=6, tied; no tie-break rule for 1v4)
// No tie-break fires. bucket=1.
// EQ: fcf_conversion=1.3334 > 0.80 → A+3; moat=4.0 ≥ 4.0 → A+2; NI=true → A+1, B+1. A=6, B=1, winner=A
// BS: net_debt=3.01 > 2.5 → C+2; coverage=4.48 < 5.0 → C+2. C=4, winner=C
// Confidence: margin=0→'low'; 0 ties→no change; missing=0→no change. Final='low'
export const UNH_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 1,
  eq_grade: 'A',
  bs_grade: 'C',
  confidence_level: 'low',
  suggested_code: '1AC',
};
