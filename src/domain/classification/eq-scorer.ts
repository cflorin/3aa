// EPIC-004: Classification Engine & Universe Screen
// STORY-042: Earnings Quality and Balance Sheet Quality Scoring
// TASK-042-002: EarningsQualityScorer implementation
// ADR-013 §Earnings Quality Scorer Point Weights; RFC-001 §Earnings Quality Scorer

import type { ClassificationInput } from './types';
import type { GradeScorerOutput } from './types';
import {
  EQ_FCF_STRONG, EQ_FCF_MODERATE, EQ_FCF_WEAK,
  EQ_MOAT_STRONG, EQ_MOAT_MODERATE, EQ_MOAT_WEAK,
  EQ_NI_POSITIVE,
} from './scoring-weights';

// Primary EQ fundamental fields tracked for missing_field_count (enrichment scores excluded)
const EQ_PRIMARY_FIELDS = ['fcf_conversion', 'fcf_positive', 'net_income_positive'] as const;

export function EarningsQualityScorer(input: ClassificationInput): GradeScorerOutput {
  const scores: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
  const reason_codes: string[] = [];

  // FCF conversion rules — mutually exclusive by range
  // Boundary: fcf_conversion == 0.80 → Moderate (B), not Strong (A); Strong requires strictly > 0.80
  if (input.fcf_conversion !== null && input.fcf_conversion !== undefined) {
    if (input.fcf_conversion > 0.80) {
      scores.A += EQ_FCF_STRONG;
      reason_codes.push('high_fcf_conversion');
    } else if (input.fcf_conversion >= 0.50) {
      scores.B += EQ_FCF_MODERATE;
      reason_codes.push('moderate_fcf_conversion');
    } else {
      scores.C += EQ_FCF_WEAK;
      reason_codes.push('weak_fcf_conversion');
    }
  }

  // FCF flag — independent of conversion; both can fire simultaneously
  if (input.fcf_positive === false) {
    scores.C += EQ_FCF_WEAK;
    reason_codes.push('fcf_not_positive');
  }

  // Moat rules — mutually exclusive by range
  // Boundary: moat_strength_score == 4.0 → Strong (A); == 2.5 → Moderate (B), not Weak
  if (input.moat_strength_score !== null && input.moat_strength_score !== undefined) {
    if (input.moat_strength_score >= 4.0) {
      scores.A += EQ_MOAT_STRONG;
      reason_codes.push('elite_moat');
    } else if (input.moat_strength_score >= 2.5) {
      scores.B += EQ_MOAT_MODERATE;
      reason_codes.push('good_franchise');
    } else {
      scores.C += EQ_MOAT_WEAK;
      reason_codes.push('weak_moat');
    }
  }

  // Net income rule — adds to both A and B (positive earnings quality signal, non-exclusive)
  if (input.net_income_positive === true) {
    scores.A += EQ_NI_POSITIVE;
    scores.B += EQ_NI_POSITIVE;
    reason_codes.push('real_earnings');
  }

  // Missing field count (primary fundamentals only; moat is enrichment, not counted)
  const missing_field_count = EQ_PRIMARY_FIELDS.reduce((n, f) => {
    const v = input[f];
    return v === null || v === undefined ? n + 1 : n;
  }, 0);

  // Winner: highest-scoring grade; tie-break A > B > C (prefer higher quality)
  let winner: 'A' | 'B' | 'C' | null = null;
  const maxScore = Math.max(scores.A, scores.B, scores.C);
  if (maxScore > 0) {
    if (scores.A === maxScore) winner = 'A';
    else if (scores.B === maxScore) winner = 'B';
    else winner = 'C';
  }

  return { scores, winner, reason_codes, missing_field_count };
}
