// EPIC-004/STORY-066: Quarterly-Driven EQ Signals
// RFC-001 Amendment 2026-04-25 — EQ scorer quarterly path when quarters_available >= 4
// ADR-013 §Earnings Quality Scorer Point Weights

import { EarningsQualityScorer } from '../../../src/domain/classification/eq-scorer';
import type { ClassificationInput } from '../../../src/domain/classification/types';
import {
  EQ_QUARTERLY_TREND_POSITIVE, EQ_QUARTERLY_TREND_NEGATIVE,
  EQ_DETERIORATING_CFO, EQ_OPLEVERAGE_EMERGING,
  EQ_EPS_DECLINING, EQ_EPS_REV_SPREAD_SEVERE,
} from '../../../src/domain/classification/scoring-weights';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBase(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    revenue_growth_fwd: 0.12, revenue_growth_3y: 0.10,
    eps_growth_fwd: 0.09, eps_growth_3y: 0.08, gross_profit_growth: 0.11,
    operating_margin: 0.20, fcf_margin: 0.18, fcf_conversion: 0.82, roic: 0.18,
    fcf_positive: true, net_income_positive: true,
    net_debt_to_ebitda: 0.5, interest_coverage: 15.0,
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
    earningsQualityTrendScore: null,
    deterioratingCashConversionFlag: false,
    operatingLeverageEmergingFlag: false,
    ...overrides,
  };
}

// ── STORY-066 Scenario A: quarterly path activation ───────────────────────────

describe('EPIC-004/STORY-066: EQ scorer quarterly path activation', () => {
  test('uses quarterly path when quartersAvailable >= 4', () => {
    const input = makeBase({
      eps_growth_3y: -0.10,  // would fire proxy eps_declining
      trend_metrics: makeTrendMetrics({ quartersAvailable: 4, earningsQualityTrendScore: 0.50 }),
    });

    const result = EarningsQualityScorer(input);

    // Quarterly path → eq_trend_positive should fire, NOT eps_declining
    expect(result.reason_codes).toContain('eq_trend_positive');
    expect(result.reason_codes).not.toContain('eps_declining');
  });

  test('uses proxy path when quartersAvailable < 4', () => {
    const input = makeBase({
      eps_growth_3y: -0.10,
      trend_metrics: makeTrendMetrics({ quartersAvailable: 3, earningsQualityTrendScore: 0.50 }),
    });

    const result = EarningsQualityScorer(input);

    // Proxy path → eps_declining should fire, NOT eq_trend_positive
    expect(result.reason_codes).toContain('eps_declining');
    expect(result.reason_codes).not.toContain('eq_trend_positive');
  });

  test('uses proxy path when trend_metrics absent', () => {
    const input = makeBase({ eps_growth_3y: -0.10 });

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).toContain('eps_declining');
    expect(result.reason_codes).not.toContain('eq_trend_positive');
  });

  test('uses proxy path when trend_metrics is null-like (quartersAvailable = 0)', () => {
    const input = makeBase({
      eps_growth_3y: -0.10,
      trend_metrics: makeTrendMetrics({ quartersAvailable: 0, earningsQualityTrendScore: 0.50 }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).toContain('eps_declining');
    expect(result.reason_codes).not.toContain('eq_trend_positive');
  });
});

// ── STORY-066 Scenario B: earningsQualityTrendScore signal ───────────────────

describe('EPIC-004/STORY-066: earningsQualityTrendScore signal', () => {
  test('eq_trend_positive fires when score > 0.30 — adds EQ_QUARTERLY_TREND_POSITIVE to A', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ earningsQualityTrendScore: 0.31 }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.scores.A).toBeGreaterThanOrEqual(EQ_QUARTERLY_TREND_POSITIVE);
    expect(result.reason_codes).toContain('eq_trend_positive');
    expect(result.reason_codes).not.toContain('eq_trend_negative');
  });

  test('eq_trend_negative fires when score < -0.30 — adds EQ_QUARTERLY_TREND_NEGATIVE to C', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ earningsQualityTrendScore: -0.31 }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.scores.C).toBeGreaterThanOrEqual(EQ_QUARTERLY_TREND_NEGATIVE);
    expect(result.reason_codes).toContain('eq_trend_negative');
    expect(result.reason_codes).not.toContain('eq_trend_positive');
  });

  test('boundary: score exactly 0.30 fires neither signal', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ earningsQualityTrendScore: 0.30 }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).not.toContain('eq_trend_positive');
    expect(result.reason_codes).not.toContain('eq_trend_negative');
  });

  test('boundary: score exactly -0.30 fires neither signal', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ earningsQualityTrendScore: -0.30 }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).not.toContain('eq_trend_negative');
    expect(result.reason_codes).not.toContain('eq_trend_positive');
  });

  test('null earningsQualityTrendScore fires no trend signal in quarterly path', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ earningsQualityTrendScore: null }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).not.toContain('eq_trend_positive');
    expect(result.reason_codes).not.toContain('eq_trend_negative');
  });

  test('score weight: EQ_QUARTERLY_TREND_POSITIVE = 2 added to A', () => {
    const baseScoreA = 0;
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      moat_strength_score: null,
      trend_metrics: makeTrendMetrics({ earningsQualityTrendScore: 0.67 }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.scores.A).toBe(baseScoreA + EQ_QUARTERLY_TREND_POSITIVE);
    expect(EQ_QUARTERLY_TREND_POSITIVE).toBe(2);
  });
});

// ── STORY-066 Scenario C: deterioratingCashConversionFlag ────────────────────

describe('EPIC-004/STORY-066: deterioratingCashConversionFlag signal', () => {
  test('deteriorating_cash_conversion fires when flag = true — adds EQ_DETERIORATING_CFO to C', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ deterioratingCashConversionFlag: true }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.scores.C).toBeGreaterThanOrEqual(EQ_DETERIORATING_CFO);
    expect(result.reason_codes).toContain('deteriorating_cash_conversion');
  });

  test('deteriorating_cash_conversion does not fire when flag = false', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ deterioratingCashConversionFlag: false }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).not.toContain('deteriorating_cash_conversion');
  });

  test('deteriorating_cash_conversion does not fire when flag = null', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ deterioratingCashConversionFlag: null }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).not.toContain('deteriorating_cash_conversion');
  });

  test('EQ_DETERIORATING_CFO weight = 1', () => {
    expect(EQ_DETERIORATING_CFO).toBe(1);
  });
});

// ── STORY-066 Scenario D: operatingLeverageEmergingFlag ──────────────────────

describe('EPIC-004/STORY-066: operatingLeverageEmergingFlag signal', () => {
  test('operating_leverage_emerging fires when flag = true — adds EQ_OPLEVERAGE_EMERGING to A and B', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ operatingLeverageEmergingFlag: true }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.scores.A).toBeGreaterThanOrEqual(EQ_OPLEVERAGE_EMERGING);
    expect(result.scores.B).toBeGreaterThanOrEqual(EQ_OPLEVERAGE_EMERGING);
    expect(result.reason_codes).toContain('operating_leverage_emerging');
  });

  test('operating_leverage_emerging fires to A and B simultaneously (non-exclusive)', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ operatingLeverageEmergingFlag: true }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.scores.A).toBe(EQ_OPLEVERAGE_EMERGING);
    expect(result.scores.B).toBe(EQ_OPLEVERAGE_EMERGING);
    // C must be untouched by this signal
    expect(result.scores.C).toBe(0);
  });

  test('operating_leverage_emerging does not fire when flag = false', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({ operatingLeverageEmergingFlag: false }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).not.toContain('operating_leverage_emerging');
  });

  test('EQ_OPLEVERAGE_EMERGING weight = 1', () => {
    expect(EQ_OPLEVERAGE_EMERGING).toBe(1);
  });
});

// ── STORY-066 Scenario E: all three quarterly signals coexist ────────────────

describe('EPIC-004/STORY-066: quarterly signals stack additively', () => {
  test('positive trend + emerging leverage: A accumulates both signals', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({
        earningsQualityTrendScore: 0.67,
        operatingLeverageEmergingFlag: true,
        deterioratingCashConversionFlag: false,
      }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.scores.A).toBe(EQ_QUARTERLY_TREND_POSITIVE + EQ_OPLEVERAGE_EMERGING);
    expect(result.scores.B).toBe(EQ_OPLEVERAGE_EMERGING);
    expect(result.reason_codes).toContain('eq_trend_positive');
    expect(result.reason_codes).toContain('operating_leverage_emerging');
  });

  test('negative trend + deteriorating CFO: C accumulates both signals', () => {
    const input = makeBase({
      fcf_conversion: null, fcf_positive: null, net_income_positive: null,
      trend_metrics: makeTrendMetrics({
        earningsQualityTrendScore: -0.67,
        deterioratingCashConversionFlag: true,
        operatingLeverageEmergingFlag: false,
      }),
    });

    const result = EarningsQualityScorer(input);

    expect(result.scores.C).toBe(EQ_QUARTERLY_TREND_NEGATIVE + EQ_DETERIORATING_CFO);
    expect(result.reason_codes).toContain('eq_trend_negative');
    expect(result.reason_codes).toContain('deteriorating_cash_conversion');
  });
});

// ── STORY-066 Scenario F: proxy signals preserved when quarterly absent ───────

describe('EPIC-004/STORY-066: proxy signals preserved when quarterly path not taken', () => {
  test('eps_declining fires in proxy path when eps_growth_3y < 0', () => {
    const input = makeBase({ eps_growth_3y: -0.05, revenue_growth_3y: 0.10 });

    const result = EarningsQualityScorer(input);

    expect(result.scores.C).toBeGreaterThanOrEqual(EQ_EPS_DECLINING);
    expect(result.reason_codes).toContain('eps_declining');
  });

  test('eps_rev_spread_severe fires in proxy path when spread < -0.20', () => {
    const input = makeBase({ eps_growth_3y: -0.30, revenue_growth_3y: 0.10 });
    // spread = -0.30 - 0.10 = -0.40 < -0.20

    const result = EarningsQualityScorer(input);

    expect(result.reason_codes).toContain('eps_rev_spread_severe');
    expect(result.scores.C).toBeGreaterThanOrEqual(EQ_EPS_REV_SPREAD_SEVERE);
  });
});
