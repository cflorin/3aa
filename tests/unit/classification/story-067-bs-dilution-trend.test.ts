// EPIC-004/STORY-067: Quarterly Dilution Trend — BS Scorer Signals
// RFC-008 §Balance Sheet Scorer coexistence period; ADR-013 §Balance Sheet Scorer Point Weights
// RFC-001 Amendment 2026-04-25 (quarterly dilution trend; coexistence period)

import { BalanceSheetQualityScorer } from '../../../src/domain/classification/bs-scorer';
import type { ClassificationInput } from '../../../src/domain/classification/types';
import {
  BS_DILUTION_TREND, BS_SBC_BURDEN,
  BS_DEBT_LOW, BS_COVERAGE_STRONG,
} from '../../../src/domain/classification/scoring-weights';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBase(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    revenue_growth_fwd: 0.12, revenue_growth_3y: 0.10,
    eps_growth_fwd: 0.09, eps_growth_3y: 0.08, gross_profit_growth: 0.11,
    operating_margin: 0.20, fcf_margin: 0.18, fcf_conversion: 0.85, roic: 0.18,
    fcf_positive: true, net_income_positive: true,
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
    materialDilutionTrendFlag: false,
    sbcBurdenScore: null,
    ...overrides,
  };
}

// ── STORY-067 Scenario A: quarterly path activation ───────────────────────────

describe('EPIC-004/STORY-067: BS quarterly path activation', () => {
  test('quarterly block fires when quartersAvailable >= 4', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 4, materialDilutionTrendFlag: true }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).toContain('material_dilution_trend');
  });

  test('quarterly block does not fire when quartersAvailable = 3', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 3, materialDilutionTrendFlag: true }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).not.toContain('material_dilution_trend');
  });

  test('quarterly block does not fire when trend_metrics absent', () => {
    const input = makeBase();

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).not.toContain('material_dilution_trend');
    expect(result.reason_codes).not.toContain('high_sbc_burden');
  });

  test('quarterly block does not fire when quartersAvailable = 0', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 0, materialDilutionTrendFlag: true }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).not.toContain('material_dilution_trend');
  });
});

// ── STORY-067 Scenario B: materialDilutionTrendFlag ──────────────────────────

describe('EPIC-004/STORY-067: materialDilutionTrendFlag signal', () => {
  test('material_dilution_trend fires when flag = true — adds BS_DILUTION_TREND to C', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ materialDilutionTrendFlag: true }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.scores.C).toBeGreaterThanOrEqual(BS_DILUTION_TREND);
    expect(result.reason_codes).toContain('material_dilution_trend');
  });

  test('material_dilution_trend does not fire when flag = false', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ materialDilutionTrendFlag: false }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).not.toContain('material_dilution_trend');
  });

  test('material_dilution_trend does not fire when flag = null', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ materialDilutionTrendFlag: null }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).not.toContain('material_dilution_trend');
  });

  test('BS_DILUTION_TREND weight = 2', () => {
    expect(BS_DILUTION_TREND).toBe(2);
  });

  test('material_dilution_trend alone adds exactly BS_DILUTION_TREND to C', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ materialDilutionTrendFlag: true, sbcBurdenScore: null }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.scores.C).toBe(BS_DILUTION_TREND);
    expect(result.scores.A).toBe(0);
    expect(result.scores.B).toBe(0);
  });
});

// ── STORY-067 Scenario C: sbcBurdenScore signal ──────────────────────────────

describe('EPIC-004/STORY-067: sbcBurdenScore signal', () => {
  test('high_sbc_burden fires when sbcBurdenScore > 0.50 — adds BS_SBC_BURDEN to C', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ sbcBurdenScore: 0.51 }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.scores.C).toBeGreaterThanOrEqual(BS_SBC_BURDEN);
    expect(result.reason_codes).toContain('high_sbc_burden');
  });

  test('boundary: sbcBurdenScore exactly 0.50 does NOT fire', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ sbcBurdenScore: 0.50 }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).not.toContain('high_sbc_burden');
  });

  test('high_sbc_burden does not fire when sbcBurdenScore < 0.50', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ sbcBurdenScore: 0.125 }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).not.toContain('high_sbc_burden');
  });

  test('high_sbc_burden does not fire when sbcBurdenScore = null', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({ sbcBurdenScore: null }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.reason_codes).not.toContain('high_sbc_burden');
  });

  test('BS_SBC_BURDEN weight = 1', () => {
    expect(BS_SBC_BURDEN).toBe(1);
  });
});

// ── STORY-067 Scenario D: both signals fire simultaneously ────────────────────

describe('EPIC-004/STORY-067: dilution trend + SBC burden stack additively', () => {
  test('both signals fire → C accumulates BS_DILUTION_TREND + BS_SBC_BURDEN', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({
        materialDilutionTrendFlag: true,
        sbcBurdenScore: 0.60,
      }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.scores.C).toBe(BS_DILUTION_TREND + BS_SBC_BURDEN);
    expect(result.reason_codes).toContain('material_dilution_trend');
    expect(result.reason_codes).toContain('high_sbc_burden');
  });

  test('winner is C when combined C score > A and B scores', () => {
    // Low debt (A=3) + strong coverage (A=2) = A:5; dilution + SBC = C:3
    // With high leverage, C wins
    const input = makeBase({
      net_debt_to_ebitda: 3.0, // → C += BS_DEBT_HIGH = 3
      interest_coverage: 3.0,  // → C += BS_COVERAGE_WEAK = 2; total C = 5
      trend_metrics: makeTrendMetrics({
        materialDilutionTrendFlag: true, // → C += 2 = 7
        sbcBurdenScore: 0.75,            // → C += 1 = 8
      }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.winner).toBe('C');
  });

  test('quarterly signals do not affect A or B scores', () => {
    const input = makeBase({
      trend_metrics: makeTrendMetrics({
        materialDilutionTrendFlag: true,
        sbcBurdenScore: 0.75,
      }),
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.scores.A).toBe(0);
    expect(result.scores.B).toBe(0);
  });
});

// ── STORY-067 Scenario E: coexistence with fundamental BS signals ─────────────

describe('EPIC-004/STORY-067: quarterly signals coexist with fundamental BS signals', () => {
  test('low leverage (A signal) + dilution trend (C signal) both contribute', () => {
    const input = makeBase({
      net_debt_to_ebitda: 0.5, // → A += BS_DEBT_LOW = 3
      interest_coverage: 20.0, // → A += BS_COVERAGE_STRONG = 2; total A = 5
      trend_metrics: makeTrendMetrics({ materialDilutionTrendFlag: true }), // → C += 2
    });

    const result = BalanceSheetQualityScorer(input);

    expect(result.scores.A).toBe(BS_DEBT_LOW + BS_COVERAGE_STRONG);
    expect(result.scores.C).toBe(BS_DILUTION_TREND);
    // A still wins because 5 > 2
    expect(result.winner).toBe('A');
    expect(result.reason_codes).toContain('low_leverage');
    expect(result.reason_codes).toContain('material_dilution_trend');
  });
});
