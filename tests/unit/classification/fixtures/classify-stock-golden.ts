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
//   5. Compute initial confidence (margin, tie_break_count, missing_field_count)
//   6. STORY-083: if initial confidence='low', apply confidence-floor search; raw fields capture pre-floor state
//
// Source inputs: tests/unit/classification/fixtures/bucket-scorer-golden.ts

import type { BucketNumber, GradeLevel } from '../../../../src/domain/classification/types';

export interface ClassifyGolden {
  bucket: BucketNumber | null;
  eq_grade: GradeLevel | null;
  bs_grade: GradeLevel | null;
  confidence_level: 'high' | 'medium' | 'low';
  suggested_code: string | null;
  // STORY-083: confidence-floor audit fields
  confidenceFloorApplied?: boolean;
  rawSuggestedCode?: string | null;
}

// MSFT: BucketScorer winner=3, margin=1 → 3v4 tie fires
// 3v4 rule: fcf_conversion=0.6491 ≤ 0.85 → B3 wins (conservative); initial code='3AA'
// STORY-083: initial confidence='low' (margin=1→low, 1 tie→degrade→low, missing=0)
// Floor: exclude B3; B4 wins alone (no competition), candidateMargin≈4, missing=0 → conf='medium'
// Final: bucket=4, confidence='medium', floor=true, rawSuggestedCode='3AA'
// EQ: fcf_conv=0.6491 in [0.50,0.80]→B+2; moat=5≥4→A+2; NI→A+1,B+1; pricing=4.5≥4→A+2;
//     recurrence=4.5≥4→A+2; margin_dur=4.5≥4→A+2; A=9,B=3 → winner=A
// BS: net_debt=0.22<1→A+3; coverage=56.44>12→A+2; A=5 → winner=A
export const MSFT_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 4,
  eq_grade: 'A',
  bs_grade: 'A',
  confidence_level: 'medium',
  suggested_code: '4AA',
  confidenceFloorApplied: true,
  rawSuggestedCode: '3AA',
};

// ADBE: BucketScorer winner=4, margin=1 → 3v4 tie fires
// 3v4 rule: fcf_conversion=1.4313>0.85 AND roic=0.5893>0.20 → B4 wins; initial code='4AA'
// STORY-083: initial confidence='low' (margin=1→low, 1 tie→degrade→low, missing=0)
// Floor: exclude B4; B3 wins alone, candidateMargin≈4, missing=0 → conf='medium' (or high?)
// Wait: ADBE B3=8, B4=9; after excluding B4 and resolving with B3=8 alone → candidateMargin≈4
//   Actually B3=8, next competitor after excluding B4 is B5=5 → candidateMargin=3 → medium
// Final: bucket=3, confidence='medium', floor=true, rawSuggestedCode='4AA'
// EQ: fcf=1.4313>0.80→A+2; moat=4.5≥4→A+2; NI→A+1,B+1; pricing=4≥4→A+2;
//     recurrence=4.5≥4→A+2; margin_dur=4.5≥4→A+2; A=11,B=1 → winner=A
// BS: net_debt=0.04<1→A+3; coverage=34.99>12→A+2; A=5 → winner=A
export const ADBE_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 3,
  eq_grade: 'A',
  bs_grade: 'A',
  confidence_level: 'medium',
  suggested_code: '3AA',
  confidenceFloorApplied: true,
  rawSuggestedCode: '4AA',
};

// TSLA: BucketScorer winner=4, margin=1 → 3v4 tie fires
// 3v4 rule: fcf_conversion=1.6394>0.85 ✓ BUT roic=0.0563≤0.20 → B3 wins; initial code='3CA'
// Note: EQ grade was 'A' in stale pre-BUG-CE-002 analysis; actual = 'C' after full EQ scoring:
//   fcf→A+2; moat=3.5→B+1; NI→A+1,B+1; pricing=2.5→B+1; recurrence=2<2.5→C+1;
//   margin_dur=2.5→B+1; eps_3y=-0.336<0→C+1; spread=-0.3879<-0.20→C+3; A=3,B=4,C=5→C
// STORY-083: initial confidence='low' (margin=1→low, 1 tie→degrade→low, missing=0)
// Floor: exclude B3; B4 wins (TSLA B4=6, others lower); candidateMargin=3 → medium
// Final: bucket=4, confidence='medium', floor=true, rawSuggestedCode='3CA'
// BS: net_debt=-1.46<1→A+3; ≤0→net_cash+1; coverage=16.43>12→A+2; A=6 → winner=A
export const TSLA_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 4,
  eq_grade: 'C',
  bs_grade: 'A',
  confidence_level: 'medium',
  suggested_code: '4CA',
  confidenceFloorApplied: true,
  rawSuggestedCode: '3CA',
};

// UBER: BucketScorer winner=5, margin=1 → 4v5 tie fires
// 4v5 rule: pre_operating_leverage_flag=false → B4 wins; initial code='4BA'
// STORY-083: initial confidence='low' (margin=1→low, 1 tie→degrade→low, missing=1(eps_3y))
// Floor: exclude B4; B5 wins alone (UBER B5=7, next=B6=4) → candidateMargin=3, missing=1 → medium
// Final: bucket=5, confidence='medium', floor=true, rawSuggestedCode='4BA'
// EQ: fcf=0.9712>0.80→A+2; moat=3.5→B+1; NI→A+1,B+1; pricing=2.5→B+1;
//     recurrence=2→C+1; margin_dur=2.5→B+1; eps_3y=null→no proxy; A=3,B=4,C=1 → winner=B
// BS: net_debt=0.40<1→A+3; coverage=13.97>12→A+2; A=5 → winner=A
export const UBER_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 5,
  eq_grade: 'B',
  bs_grade: 'A',
  confidence_level: 'medium',
  suggested_code: '5BA',
  confidenceFloorApplied: true,
  rawSuggestedCode: '4BA',
};

// UNH: BucketScorer winner=1, margin=0 (B1=B4=6; no tie-break rule for 1v4 → B1 by position)
// Initial code='1AC', confidence='low' (margin=0→low, 0 ties, missing=0)
// STORY-083: floor: exclude B1; B4 wins (B4=6, B3=4 next) → candidateMargin=2, missing=0 → medium
// Final: bucket=4, confidence='medium', floor=true, rawSuggestedCode='1AC'
// EQ: fcf=1.3334>0.80→A+2; moat=4≥4→A+2; NI→A+1,B+1; pricing=3.5→B+1;
//     recurrence=4.5≥4→A+2; margin_dur=3.5→B+1; eps_3y=-0.1485<0→C+1; spread=-0.262<-0.20→C+3;
//     A=7,B=3,C=4 → winner=A
// BS: net_debt=3.01>2.5→C+2; coverage=4.48<5→C+2; C=4 → winner=C
export const UNH_CLASSIFY_GOLDEN: ClassifyGolden = {
  bucket: 4,
  eq_grade: 'A',
  bs_grade: 'C',
  confidence_level: 'medium',
  suggested_code: '4AC',
  confidenceFloorApplied: true,
  rawSuggestedCode: '1AC',
};
