// EPIC-004: Classification Engine & Universe Screen
// STORY-042: Earnings Quality and Balance Sheet Quality Scoring
// TASK-042-003: BalanceSheetQualityScorer implementation
// ADR-013 §Balance Sheet Scorer Point Weights; RFC-001 §Balance Sheet Quality Scorer

import type { ClassificationInput } from './types';
import type { GradeScorerOutput } from './types';
import {
  BS_DEBT_LOW, BS_DEBT_MODERATE, BS_DEBT_HIGH,
  BS_COVERAGE_STRONG, BS_COVERAGE_MODERATE, BS_COVERAGE_WEAK,
  BS_CAPITAL_INTENSITY, BS_NET_CASH_BONUS,
} from './scoring-weights';

// Primary BS fundamental fields tracked for missing_field_count (enrichment scores excluded)
const BS_PRIMARY_FIELDS = ['net_debt_to_ebitda', 'interest_coverage'] as const;

export function BalanceSheetQualityScorer(input: ClassificationInput): GradeScorerOutput {
  const scores: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
  const reason_codes: string[] = [];

  // Leverage rules — mutually exclusive; net-cash bonus stacks on top of Debt Low
  // Boundary: net_debt_to_ebitda < 1.0 strict for Low; == 1.0 → Moderate; > 2.5 → High; == 2.5 → Moderate
  // Net-cash: net_debt_to_ebitda ≤ 0 fires bonus IN ADDITION to Debt Low (both apply, stacking to A=4)
  if (input.net_debt_to_ebitda !== null && input.net_debt_to_ebitda !== undefined) {
    if (input.net_debt_to_ebitda < 1.0) {
      scores.A += BS_DEBT_LOW;
      reason_codes.push('low_leverage');
      if (input.net_debt_to_ebitda <= 0) {
        scores.A += BS_NET_CASH_BONUS;
        reason_codes.push('net_cash_position');
      }
    } else if (input.net_debt_to_ebitda <= 2.5) {
      scores.B += BS_DEBT_MODERATE;
      reason_codes.push('manageable_leverage');
    } else {
      scores.C += BS_DEBT_HIGH;
      reason_codes.push('high_leverage');
    }
  }

  // Coverage rules — mutually exclusive
  // Boundary: interest_coverage == 12.0 → Moderate (B); Strong requires strictly > 12.0
  // Boundary: interest_coverage == 5.0 → Moderate (B); Weak requires strictly < 5.0
  if (input.interest_coverage !== null && input.interest_coverage !== undefined) {
    if (input.interest_coverage > 12.0) {
      scores.A += BS_COVERAGE_STRONG;
      reason_codes.push('high_interest_coverage');
    } else if (input.interest_coverage >= 5.0) {
      scores.B += BS_COVERAGE_MODERATE;
      reason_codes.push('adequate_interest_coverage');
    } else {
      scores.C += BS_COVERAGE_WEAK;
      reason_codes.push('weak_interest_coverage');
    }
  }

  // Capital intensity — independent enrichment rule
  if (input.capital_intensity_score !== null && input.capital_intensity_score !== undefined) {
    if (input.capital_intensity_score >= 4.0) {
      scores.C += BS_CAPITAL_INTENSITY;
      reason_codes.push('high_capital_intensity');
    }
  }

  // Missing field count (primary fundamentals only; capital_intensity_score is enrichment, not counted)
  const missing_field_count = BS_PRIMARY_FIELDS.reduce((n, f) => {
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
