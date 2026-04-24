// EPIC-004: Classification Engine & Universe Screen
// STORY-041: Bucket Scoring Algorithm
// TASK-041-002: Primary fundamental scoring rules (Buckets 1–7)
// TASK-041-003: Enrichment bonus rules (E1/E5/E6)
// RFC-001 §Bucket Scorer; ADR-013 §Bucket Scorer Point Weights; ADR-013 §Bucket-Specific Growth Ranges

import type { ClassificationInput, BucketNumber, BucketScorerOutput } from './types';
import {
  REV_PRIMARY,
  REV_SECONDARY,
  EPS_PRIMARY,
  EPS_SECONDARY,
  PROFITABILITY,
  FCF_CONVERSION_WEIGHT,
  FLAG_PRIMARY,
  ENRICHMENT_BONUS,
} from './scoring-weights';
import { CRITICAL_FIELDS } from './confidence-thresholds';

// ── Bucket growth range boundaries (decimal fractions; e.g., 0.08 = 8%) ──
// ADR-013 §Bucket-Specific Growth Ranges
const B1_MAX = 0.02;  // Bucket 1: ≤ 2% (inclusive)
const B2_MAX = 0.03;  // Bucket 2: (2%, 3%] — 3% fires B2, NOT B3
const B3_MIN = 0.03;  // Bucket 3: (3%, 8%) — exclusive both ends
const B3_MAX = 0.08;  // 8.0% is the inclusive lower bound for Bucket 4, NOT Bucket 3
const B4_MIN = 0.08;  // Bucket 4: [8%, 15%] — ADR-013: 8.0% fires B4
const B4_MAX = 0.15;
const B5_MIN = 0.10;  // Bucket 5: [10%, 20%] — overlaps B4 (10–15%) and B6 (15–20%) by design
const B5_MAX = 0.20;
const B6_MIN = 0.15;  // Bucket 6: (15%, 35%] — 15% fires B4/B5 but NOT B6
const B6_MAX = 0.35;
const B7_MIN = 0.35;  // Bucket 7: > 35%

// FCF conversion threshold for Bucket 3/4 profitability signal.
// 50% = lower bound of "moderate FCF quality" per PRD Bucket 3 profile.
// EQ scorer uses stricter thresholds (>80% for EQ-A) — these are separate concerns.
const FCF_CONVERSION_THRESHOLD = 0.50;

// Operating margin threshold for Bucket 3/4 profitability signal.
// 15% represents entry-level sustainable margin for quality businesses (PRD Bucket 3 profile:
// "established margins"). Locked by golden-set regression test after implementation.
const OPERATING_MARGIN_THRESHOLD = 0.15;

// Enrichment bonus threshold — ADR-013 §Enrichment Bonus Rules
const ENRICHMENT_THRESHOLD = 4.0;

function initScores(): Record<BucketNumber, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
}

// Returns which buckets 1–7 a growth value fires. Overlapping ranges are intentional.
// Bucket 8 is never included — binary_flag override handled in STORY-043.
function bucketsForGrowth(v: number): BucketNumber[] {
  const result: BucketNumber[] = [];
  if (v <= B1_MAX) result.push(1);
  // B2: exclusive 2%, inclusive 3% — 3% fires B2, NOT B3
  if (v > B1_MAX && v <= B2_MAX) result.push(2);
  // B3: exclusive both ends — 3% fires B2, 8% fires B4
  if (v > B3_MIN && v < B3_MAX) result.push(3);
  // B4: inclusive lower — 8.0% fires B4, ADR-013 §Bucket-Specific Growth Ranges
  if (v >= B4_MIN && v <= B4_MAX) result.push(4);
  // B5 overlaps B4 ([10–15%]) and B6 ([15–20%]) simultaneously by design
  if (v >= B5_MIN && v <= B5_MAX) result.push(5);
  // B6: exclusive lower — 15% fires B4/B5 but NOT B6
  if (v > B6_MIN && v <= B6_MAX) result.push(6);
  if (v > B7_MIN) result.push(7);
  return result;
}

function applyGrowthRule(
  value: number | null | undefined,
  points: number,
  scores: Record<BucketNumber, number>,
  reasons: string[],
  reasonCode: string,
): void {
  if (value === null || value === undefined) return;
  const buckets = bucketsForGrowth(value);
  for (const b of buckets) {
    scores[b] += points;
  }
  if (buckets.length > 0) reasons.push(reasonCode);
}

export function BucketScorer(input: ClassificationInput): BucketScorerOutput {
  const scores = initScores();
  const reasons: string[] = [];

  // Compute missing_field_count once: CRITICAL_FIELDS that are null/undefined
  let missing_field_count = 0;
  for (const field of CRITICAL_FIELDS) {
    if (input[field] === null || input[field] === undefined) {
      missing_field_count++;
    }
  }

  // ── Primary revenue rules (REV_PRIMARY=3) ──
  applyGrowthRule(input.revenue_growth_fwd, REV_PRIMARY, scores, reasons, 'rev_fwd_primary');

  // ── Secondary revenue rules (REV_SECONDARY=2): same ranges, lower weight ──
  applyGrowthRule(input.revenue_growth_3y, REV_SECONDARY, scores, reasons, 'rev_3y_secondary');
  applyGrowthRule(input.gross_profit_growth, REV_SECONDARY, scores, reasons, 'gross_profit_secondary');

  // ── EPS rules ──
  applyGrowthRule(input.eps_growth_fwd, EPS_PRIMARY, scores, reasons, 'eps_fwd_primary');
  applyGrowthRule(input.eps_growth_3y, EPS_SECONDARY, scores, reasons, 'eps_3y_secondary');

  // ── Profitability rules (PROFITABILITY=1) — each fires independently for Buckets 3 and 4 ──
  if (input.fcf_positive === true) {
    scores[3] += PROFITABILITY;
    scores[4] += PROFITABILITY;
    reasons.push('fcf_positive');
  }

  if (input.net_income_positive === true) {
    scores[3] += PROFITABILITY;
    scores[4] += PROFITABILITY;
    reasons.push('net_income_positive');
  }

  if (input.operating_margin !== null && input.operating_margin !== undefined) {
    if (input.operating_margin >= OPERATING_MARGIN_THRESHOLD) {
      scores[3] += PROFITABILITY;
      scores[4] += PROFITABILITY;
      reasons.push('operating_margin_profitability');
    }
  }

  // ── FCF conversion rule (FCF_CONVERSION_WEIGHT=1) ──
  if (input.fcf_conversion !== null && input.fcf_conversion !== undefined) {
    if (input.fcf_conversion >= FCF_CONVERSION_THRESHOLD) {
      scores[3] += FCF_CONVERSION_WEIGHT;
      scores[4] += FCF_CONVERSION_WEIGHT;
      reasons.push('fcf_conversion_quality');
    }
  }

  // ── Flag rule: pre_operating_leverage → Bucket 5 (FLAG_PRIMARY=2) ──
  if (input.pre_operating_leverage_flag === true) {
    scores[5] += FLAG_PRIMARY;
    reasons.push('pre_operating_leverage_flag');
  }

  // ── Reason-code-only flags (no score change, per STORY-043 special-case overrides) ──
  if (input.insurer_flag === true) reasons.push('insurer_flag_applied');
  if (input.optionality_flag === true) reasons.push('optionality_flag_applied');

  // ── Enrichment bonus rules (E1/E5/E6) ──
  // E2 (pricing_power), E3 (revenue_recurrence), E4 (margin_durability) → EQ scorer (STORY-042)
  // TODO: enforce enrichment cap (max 3 bonuses per bucket) if more E-score sources are added

  if (input.moat_strength_score !== null && input.moat_strength_score !== undefined) {
    if (input.moat_strength_score >= ENRICHMENT_THRESHOLD) {
      scores[3] += ENRICHMENT_BONUS;
      scores[4] += ENRICHMENT_BONUS;
      reasons.push('moat_enrichment_bonus');
    }
  }

  if (input.qualitative_cyclicality_score !== null && input.qualitative_cyclicality_score !== undefined) {
    if (input.qualitative_cyclicality_score >= ENRICHMENT_THRESHOLD) {
      scores[5] += ENRICHMENT_BONUS;
      scores[6] += ENRICHMENT_BONUS;
      reasons.push('cyclicality_enrichment_bonus');
    }
  }

  if (input.capital_intensity_score !== null && input.capital_intensity_score !== undefined) {
    if (input.capital_intensity_score >= ENRICHMENT_THRESHOLD) {
      scores[5] += ENRICHMENT_BONUS;
      reasons.push('capital_intensity_enrichment_bonus');
    }
  }

  // ── Determine winner and margin (Buckets 1–7 only; Bucket 8 excluded) ──
  let winner: BucketNumber | null = null;
  let winnerScore = -1;
  let secondScore = -1;

  for (let b = 1; b <= 7; b++) {
    const s = scores[b as BucketNumber];
    if (s > winnerScore) {
      secondScore = winnerScore;
      winnerScore = s;
      winner = b as BucketNumber;
    } else if (s > secondScore) {
      secondScore = s;
    }
  }

  // All scores zero means no signals fired — winner is indeterminate
  if (winnerScore === 0) winner = null;

  const margin = winner !== null ? winnerScore - Math.max(secondScore, 0) : 0;

  return {
    scores,
    winner,
    margin,
    reason_codes: reasons,
    missing_field_count,
  };
}
