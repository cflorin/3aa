// EPIC-004/STORY-068: Quarterly Growth Context — Bucket Scorer Tie-Break
// RFC-001 Amendment 2026-04-25 (operating_income_acceleration_flag as tie-break)
// ADR-013 §Bucket Scorer Point Weights; RFC-001 §Bucket Scorer

import { BucketScorer } from '../../../src/domain/classification/bucket-scorer';
import type { ClassificationInput } from '../../../src/domain/classification/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBase(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    revenue_growth_fwd: null, revenue_growth_3y: null,
    eps_growth_fwd: null, eps_growth_3y: null, gross_profit_growth: null,
    operating_margin: null, fcf_margin: null, fcf_conversion: null, roic: null,
    fcf_positive: null, net_income_positive: null,
    net_debt_to_ebitda: null, interest_coverage: null,
    moat_strength_score: null, pricing_power_score: null, revenue_recurrence_score: null,
    margin_durability_score: null, capital_intensity_score: null, qualitative_cyclicality_score: null,
    holding_company_flag: false, insurer_flag: false, cyclicality_flag: false,
    optionality_flag: false, binary_flag: false, pre_operating_leverage_flag: false,
    ...overrides,
  };
}

function makeTrendMetrics(overrides: Record<string, unknown> = {}) {
  return {
    quartersAvailable: 8,
    operatingIncomeAccelerationFlag: false,
    ...overrides,
  };
}

// ── STORY-068 Scenario A: quarterly block activation ─────────────────────────

describe('EPIC-004/STORY-068: acceleration tie-break quarterly block activation', () => {
  test('tie-break fires when quartersAvailable >= 4 and flag = true', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 4, operatingIncomeAccelerationFlag: true }),
    });

    const result = BucketScorer(input);

    expect(result.reason_codes).toContain('op_income_acceleration_tiebreak');
  });

  test('tie-break does not fire when quartersAvailable = 3', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 3, operatingIncomeAccelerationFlag: true }),
    });

    const result = BucketScorer(input);

    expect(result.reason_codes).not.toContain('op_income_acceleration_tiebreak');
  });

  test('tie-break does not fire when trend_metrics absent', () => {
    const input = makeBase();

    const result = BucketScorer(input);

    expect(result.reason_codes).not.toContain('op_income_acceleration_tiebreak');
  });

  test('tie-break does not fire when flag = false', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ operatingIncomeAccelerationFlag: false }),
    });

    const result = BucketScorer(input);

    expect(result.reason_codes).not.toContain('op_income_acceleration_tiebreak');
  });

  test('tie-break does not fire when flag = null', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ operatingIncomeAccelerationFlag: null }),
    });

    const result = BucketScorer(input);

    expect(result.reason_codes).not.toContain('op_income_acceleration_tiebreak');
  });
});

// ── STORY-068 Scenario B: score impact on Bucket 4 and Bucket 5 ──────────────

describe('EPIC-004/STORY-068: acceleration flag adds +1 to Bucket 4 and Bucket 5', () => {
  test('both Bucket 4 and Bucket 5 receive +1 when flag fires', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ operatingIncomeAccelerationFlag: true }),
    });

    const result = BucketScorer(input);

    // With no other signals, Buckets 4 and 5 each get exactly 1
    expect(result.scores[4]).toBe(1);
    expect(result.scores[5]).toBe(1);
  });

  test('no other buckets are affected by the flag', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ operatingIncomeAccelerationFlag: true }),
    });

    const result = BucketScorer(input);

    expect(result.scores[1]).toBe(0);
    expect(result.scores[2]).toBe(0);
    expect(result.scores[3]).toBe(0);
    expect(result.scores[6]).toBe(0);
    expect(result.scores[7]).toBe(0);
    expect(result.scores[8]).toBe(0);
  });

  test('flag stacks additively with revenue growth signals on Bucket 4', () => {
    // revenue_growth_fwd = 0.10 → fires Bucket 4 (REV_PRIMARY=3) and Bucket 5 (REV_PRIMARY=3)
    const input = makeBase({
      revenue_growth_fwd: 0.10,
      trend_metrics: makeTrendMetrics({ operatingIncomeAccelerationFlag: true }),
    });

    const result = BucketScorer(input);

    // REV_PRIMARY=3 fires for B4 and B5 (10% is in [8,15] and [10,20])
    // Flag adds +1 to B4 and B5
    expect(result.scores[4]).toBe(3 + 1); // REV_PRIMARY + acceleration
    expect(result.scores[5]).toBe(3 + 1);
  });
});

// ── STORY-068 Scenario C: tie-break effect in borderline scoring ──────────────

describe('EPIC-004/STORY-068: acceleration flag as tie-break in borderline scenarios', () => {
  test('flag tips B4 score over B5 when combined with B4-aligned growth', () => {
    // revenue_growth_3y = 0.12 → fires Bucket 4 (REV_SECONDARY=2) and Bucket 5 (REV_SECONDARY=2)
    // Without flag: B4=2, B5=2 (tie)
    // With flag: B4=3, B5=3 (still tied — same +1 to both)
    // The tie-break flag itself does not break the tie alone, but it correctly adds to both
    const input = makeBase({
      revenue_growth_3y: 0.12, // 12% in [8,15] and [10,20]
      trend_metrics: makeTrendMetrics({ operatingIncomeAccelerationFlag: true }),
    });

    const result = BucketScorer(input);

    expect(result.scores[4]).toBe(2 + 1); // REV_SECONDARY + flag
    expect(result.scores[5]).toBe(2 + 1);
  });

  test('flag combined with B4-primary signal raises B4 margin over B3', () => {
    // revenue_growth_fwd = 0.09 → fires Bucket 4 (REV_PRIMARY=3) only (9% in [8,15], not [10,20])
    // With flag: B4 gets +1 extra
    const input = makeBase({
      revenue_growth_fwd: 0.09,
      trend_metrics: makeTrendMetrics({ operatingIncomeAccelerationFlag: true }),
    });

    const result = BucketScorer(input);

    expect(result.scores[4]).toBe(3 + 1); // REV_PRIMARY + acceleration
    expect(result.scores[5]).toBe(0 + 1); // only flag (9% < 10% B5 min)
    expect(result.winner).toBe(4);
    expect(result.margin).toBe(3); // B4:4 vs B5:1
  });

  test('winner is indeterminate (null) when no primary signals fire and no flag', () => {
    const input = makeBase();

    const result = BucketScorer(input);

    expect(result.winner).toBeNull();
    expect(result.scores[4]).toBe(0);
    expect(result.scores[5]).toBe(0);
  });
});

// ── STORY-068 Scenario D: reason code logged once only ───────────────────────

describe('EPIC-004/STORY-068: reason code uniqueness', () => {
  test('op_income_acceleration_tiebreak appears exactly once in reason_codes', () => {
    const input = makeBase({
      revenue_growth_fwd: 0.12,
      trend_metrics: makeTrendMetrics({ operatingIncomeAccelerationFlag: true }),
    });

    const result = BucketScorer(input);

    const count = result.reason_codes.filter(c => c === 'op_income_acceleration_tiebreak').length;
    expect(count).toBe(1);
  });
});
