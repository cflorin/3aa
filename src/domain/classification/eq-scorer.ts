// EPIC-004: Classification Engine & Universe Screen
// STORY-042: Earnings Quality and Balance Sheet Quality Scoring
// TASK-042-002: EarningsQualityScorer implementation
// ADR-013 §Earnings Quality Scorer Point Weights; RFC-001 §Earnings Quality Scorer

// [BUG-CE-002] pricing_power_score, revenue_recurrence_score, margin_durability_score (E2/E3/E4)
// were missing from this scorer — implemented below. See docs/bugs/CLASSIFICATION-ENGINE-BUG-REGISTRY.md.

import type { ClassificationInput } from './types';
import type { GradeScorerOutput } from './types';
import {
  EQ_FCF_STRONG, EQ_FCF_MODERATE, EQ_FCF_WEAK,
  EQ_MOAT_STRONG, EQ_MOAT_MODERATE, EQ_MOAT_WEAK,
  EQ_NI_POSITIVE,
  EQ_PRICING_STRONG, EQ_PRICING_MODERATE, EQ_PRICING_WEAK,
  EQ_RECURRENCE_STRONG, EQ_RECURRENCE_MODERATE, EQ_RECURRENCE_WEAK,
  EQ_MARGIN_DUR_STRONG, EQ_MARGIN_DUR_MODERATE, EQ_MARGIN_DUR_WEAK,
  EQ_EPS_DECLINING, EQ_EPS_REV_SPREAD_MODERATE, EQ_EPS_REV_SPREAD_SEVERE,
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

  // E2: pricing power — mutually exclusive by range, same thresholds as moat
  if (input.pricing_power_score !== null && input.pricing_power_score !== undefined) {
    if (input.pricing_power_score >= 4.0) {
      scores.A += EQ_PRICING_STRONG;
      reason_codes.push('strong_pricing_power');
    } else if (input.pricing_power_score >= 2.5) {
      scores.B += EQ_PRICING_MODERATE;
      reason_codes.push('moderate_pricing_power');
    } else {
      scores.C += EQ_PRICING_WEAK;
      reason_codes.push('weak_pricing_power');
    }
  }

  // E3: revenue recurrence — mutually exclusive by range
  if (input.revenue_recurrence_score !== null && input.revenue_recurrence_score !== undefined) {
    if (input.revenue_recurrence_score >= 4.0) {
      scores.A += EQ_RECURRENCE_STRONG;
      reason_codes.push('strong_revenue_recurrence');
    } else if (input.revenue_recurrence_score >= 2.5) {
      scores.B += EQ_RECURRENCE_MODERATE;
      reason_codes.push('moderate_revenue_recurrence');
    } else {
      scores.C += EQ_RECURRENCE_WEAK;
      reason_codes.push('weak_revenue_recurrence');
    }
  }

  // E4: margin durability — mutually exclusive by range
  if (input.margin_durability_score !== null && input.margin_durability_score !== undefined) {
    if (input.margin_durability_score >= 4.0) {
      scores.A += EQ_MARGIN_DUR_STRONG;
      reason_codes.push('strong_margin_durability');
    } else if (input.margin_durability_score >= 2.5) {
      scores.B += EQ_MARGIN_DUR_MODERATE;
      reason_codes.push('moderate_margin_durability');
    } else {
      scores.C += EQ_MARGIN_DUR_WEAK;
      reason_codes.push('weak_margin_durability');
    }
  }

  // Earnings volatility signals (ADR-013 amendment 2026-04-25)
  // Proxy for "clockwork" earnings: negative EPS CAGR or severe EPS-vs-revenue spread → C.
  // Spread signals are mutually exclusive; EQ_EPS_DECLINING stacks with whichever fires.
  if (input.eps_growth_3y !== null && input.eps_growth_3y !== undefined) {
    if (input.eps_growth_3y < 0) {
      scores.C += EQ_EPS_DECLINING;
      reason_codes.push('eps_declining');
    }
  }

  if (
    input.eps_growth_3y !== null && input.eps_growth_3y !== undefined &&
    input.revenue_growth_3y !== null && input.revenue_growth_3y !== undefined
  ) {
    const spread = input.eps_growth_3y - input.revenue_growth_3y;
    if (spread < -0.20) {
      scores.C += EQ_EPS_REV_SPREAD_SEVERE;
      reason_codes.push('eps_rev_spread_severe');
    } else if (spread < -0.10) {
      scores.C += EQ_EPS_REV_SPREAD_MODERATE;
      reason_codes.push('eps_rev_spread_moderate');
    }
  }

  // Missing field count (primary fundamentals only; enrichment scores excluded)
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
