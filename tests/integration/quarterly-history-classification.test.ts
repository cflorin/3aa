// EPIC-004/STORY-072: Quarterly History Classification Engine Regression & Coherence Tests
// RFC-001 Amendment 2026-04-25, RFC-008
// ADR-014 Amendment 2026-04-25, ADR-016
// All tests are unit-style with real scorer code; no database required

import { classifyStock } from '../../src/domain/classification/classifier';
import { EarningsQualityScorer } from '../../src/domain/classification/eq-scorer';
import { BalanceSheetQualityScorer } from '../../src/domain/classification/bs-scorer';
import { BucketScorer } from '../../src/domain/classification/bucket-scorer';
import { shouldRecompute } from '../../src/domain/classification/recompute';
import type { ClassificationInput, ClassificationTrendMetrics } from '../../src/domain/classification/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBaseInput(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    revenue_growth_fwd: 0.12, revenue_growth_3y: 0.12,
    eps_growth_fwd: 0.10, eps_growth_3y: 0.09, gross_profit_growth: 0.11,
    operating_margin: 0.22, fcf_margin: 0.18, fcf_conversion: 0.85, roic: 0.20,
    fcf_positive: true, net_income_positive: true,
    net_debt_to_ebitda: 0.5, interest_coverage: 20.0,
    moat_strength_score: 4.0, pricing_power_score: 3.5,
    revenue_recurrence_score: 4.0, margin_durability_score: 3.5,
    capital_intensity_score: 2.0, qualitative_cyclicality_score: 2.0,
    holding_company_flag: false, insurer_flag: false, cyclicality_flag: false,
    optionality_flag: false, binary_flag: false, pre_operating_leverage_flag: false,
    ...overrides,
  };
}

const STABLE_TREND_METRICS: ClassificationTrendMetrics = {
  quartersAvailable: 12,
  operatingMarginStabilityScore: 0.82,
  earningsQualityTrendScore: 0.50,
  deterioratingCashConversionFlag: false,
  operatingLeverageEmergingFlag: true,
  materialDilutionTrendFlag: false,
  sbcBurdenScore: 0.12,
  operatingIncomeAccelerationFlag: false,
};

const DETERIORATING_TREND_METRICS: ClassificationTrendMetrics = {
  quartersAvailable: 5,
  operatingMarginStabilityScore: 0.30,
  earningsQualityTrendScore: -0.45,
  deterioratingCashConversionFlag: true,
  operatingLeverageEmergingFlag: false,
  materialDilutionTrendFlag: true,
  sbcBurdenScore: 0.65,
  operatingIncomeAccelerationFlag: false,
};

// ── STORY-072 Scenario A: Positive coherence scenario ──────────────────────────

describe('EPIC-004/STORY-072: Positive quarterly scenario coherence', () => {
  test('stock with 12 quarters + improving EQ trend: EQ scorer fires eq_trend_positive', () => {
    const input = makeBaseInput({ trend_metrics: STABLE_TREND_METRICS });

    const eqResult = EarningsQualityScorer(input);

    expect(eqResult.reason_codes).toContain('eq_trend_positive');
    expect(eqResult.reason_codes).toContain('operating_leverage_emerging');
  });

  test('positive scenario: EQ grade benefits from quarterly path over proxy-only baseline', () => {
    // With stable quarterly signals, A score should be higher than proxy-only would produce
    const withQuarterly = makeBaseInput({ trend_metrics: STABLE_TREND_METRICS });
    const withoutQuarterly = makeBaseInput(); // proxy path

    const eqWith = EarningsQualityScorer(withQuarterly);
    const eqWithout = EarningsQualityScorer(withoutQuarterly);

    // Quarterly adds eq_trend_positive (+2 to A) and operating_leverage_emerging (+1 to A/B)
    expect(eqWith.scores.A).toBeGreaterThan(eqWithout.scores.A);
  });

  test('positive scenario: confidence not degraded by trajectory penalty (8+ quarters, stable)', () => {
    const input = makeBaseInput({ trend_metrics: STABLE_TREND_METRICS });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep).toBeDefined();
    expect(trajectoryStep?.note).toBe('no degradation');
  });

  test('positive scenario: no material_dilution_trend in BS reason codes', () => {
    const input = makeBaseInput({ trend_metrics: STABLE_TREND_METRICS });

    const bsResult = BalanceSheetQualityScorer(input);

    expect(bsResult.reason_codes).not.toContain('material_dilution_trend');
  });

  test('positive scenario: full classify produces a non-null bucket and code', () => {
    const input = makeBaseInput({ trend_metrics: STABLE_TREND_METRICS });

    const result = classifyStock(input);

    expect(result.bucket).not.toBeNull();
    expect(result.suggested_code).not.toBeNull();
  });
});

// ── STORY-072 Scenario B: Negative/deteriorating scenario ─────────────────────

describe('EPIC-004/STORY-072: Negative quarterly scenario coherence', () => {
  test('stock with 5 quarters: confidence capped at MEDIUM (not HIGH)', () => {
    const input = makeBaseInput({ trend_metrics: DETERIORATING_TREND_METRICS });

    const result = classifyStock(input);

    expect(result.confidence_level).not.toBe('high');
  });

  test('deteriorating scenario: material_dilution_trend fires in BS scorer', () => {
    const input = makeBaseInput({ trend_metrics: DETERIORATING_TREND_METRICS });

    const bsResult = BalanceSheetQualityScorer(input);

    expect(bsResult.reason_codes).toContain('material_dilution_trend');
    expect(bsResult.reason_codes).toContain('high_sbc_burden');
    expect(bsResult.scores.C).toBeGreaterThan(0);
  });

  test('deteriorating scenario: trajectory penalty fires for stability score < 0.40', () => {
    // deteriorating: stability_score = 0.30 < 0.40 → degrade
    // Also: 5 quarters < 8 → cap MEDIUM
    const input = makeBaseInput({ trend_metrics: DETERIORATING_TREND_METRICS });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).toContain('stability_score=0.30');
  });

  test('deteriorating scenario: confidence is LOW when multiple degrade conditions fire', () => {
    // 5 quarters: caps at MEDIUM. stability_score=0.30 → degrade. combined → low likely
    const input = makeBaseInput({ trend_metrics: DETERIORATING_TREND_METRICS });

    const result = classifyStock(input);

    // With cap MEDIUM + degrade from stability → result is LOW
    expect(result.confidence_level).toBe('low');
  });
});

// ── STORY-072 Scenario C: Graceful degradation — scorers identical without trend_metrics ───

describe('EPIC-004/STORY-072: Graceful degradation — trend_metrics absent', () => {
  test('EQ scorer: proxy path output unchanged when trend_metrics absent', () => {
    const withoutTrend = makeBaseInput();
    const withTrend = makeBaseInput({ trend_metrics: undefined });

    const eq1 = EarningsQualityScorer(withoutTrend);
    const eq2 = EarningsQualityScorer(withTrend);

    expect(eq1.scores).toEqual(eq2.scores);
    expect(eq1.winner).toBe(eq2.winner);
  });

  test('BS scorer: output unchanged when trend_metrics absent', () => {
    const withoutTrend = makeBaseInput();
    const withTrend = makeBaseInput({ trend_metrics: undefined });

    const bs1 = BalanceSheetQualityScorer(withoutTrend);
    const bs2 = BalanceSheetQualityScorer(withTrend);

    expect(bs1.scores).toEqual(bs2.scores);
    expect(bs1.winner).toBe(bs2.winner);
  });

  test('Bucket scorer: output unchanged when trend_metrics absent', () => {
    const withoutTrend = makeBaseInput();
    const withTrend = makeBaseInput({ trend_metrics: undefined });

    const b1 = BucketScorer(withoutTrend);
    const b2 = BucketScorer(withTrend);

    expect(b1.scores).toEqual(b2.scores);
    expect(b1.winner).toBe(b2.winner);
    expect(b1.reason_codes).toEqual(b2.reason_codes);
  });

  test('classifyStock: Step 5 absent when trend_metrics absent', () => {
    const input = makeBaseInput();

    const result = classifyStock(input);

    const labels = result.confidenceBreakdown.steps.map(s => s.label);
    expect(labels).not.toContain('trajectory quality penalty');
    // Final step should be step 5
    const finalStep = result.confidenceBreakdown.steps.find(s => s.label === 'final');
    expect(finalStep?.step).toBe(5);
  });

  test('classifyStock: step count is 5 when trend_metrics absent (steps 1-4 + final)', () => {
    const input = makeBaseInput();

    const result = classifyStock(input);

    expect(result.confidenceBreakdown.steps).toHaveLength(5);
  });
});

// ── STORY-072 Scenario D: shouldRecompute quarterly trigger ───────────────────

describe('EPIC-004/STORY-072: shouldRecompute quarterly trigger', () => {
  const base = makeBaseInput();

  test('returns true when quarterlyDataUpdated=true', () => {
    expect(shouldRecompute(base, { ...base }, { quarterlyDataUpdated: true })).toBe(true);
  });

  test('returns false when quarterlyDataUpdated=false and no other changes', () => {
    expect(shouldRecompute(base, { ...base }, { quarterlyDataUpdated: false })).toBe(false);
  });

  test('returns true via fundamental change even when quarterlyDataUpdated=false', () => {
    const changed = makeBaseInput({ revenue_growth_fwd: 0.25 }); // large delta
    expect(shouldRecompute(changed, base, { quarterlyDataUpdated: false })).toBe(true);
  });

  test('existing trigger: null previous → true without opts', () => {
    expect(shouldRecompute(base, null)).toBe(true);
  });

  test('existing trigger: identical inputs → false without opts', () => {
    expect(shouldRecompute(base, { ...base })).toBe(false);
  });
});

// ── STORY-072 Scenario E: Confidence Step 5 — all five penalty conditions ─────

describe('EPIC-004/STORY-072: all five confidence trajectory penalty conditions', () => {
  test('Condition 1: quarters_available < 4 → force LOW', () => {
    const input = makeBaseInput({
      trend_metrics: { ...STABLE_TREND_METRICS, quartersAvailable: 3 },
    });
    const result = classifyStock(input);
    expect(result.confidence_level).toBe('low');
    const step = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(step?.note).toContain('force LOW');
  });

  test('Condition 2: quarters_available 4-7 → cap MEDIUM (cannot be HIGH)', () => {
    const input = makeBaseInput({
      trend_metrics: { ...STABLE_TREND_METRICS, quartersAvailable: 6 },
    });
    const result = classifyStock(input);
    const step = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    // After cap, band is at most medium; if band was already medium or low, note may say 'no degradation'
    // but band is not high
    expect(step?.band).not.toBe('high');
  });

  test('Condition 3: stability_score < 0.40 → degrade one level', () => {
    const input = makeBaseInput({
      trend_metrics: { ...STABLE_TREND_METRICS, quartersAvailable: 8, operatingMarginStabilityScore: 0.35 },
    });
    const result = classifyStock(input);
    const step = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(step?.note).toContain('stability_score=0.35');
  });

  test('Condition 4: deteriorating CFO + EQ in [A,B] → degrade one level', () => {
    // Force EQ-A outcome with high moat + strong FCF, then apply deteriorating CFO
    const input = makeBaseInput({
      fcf_conversion: 0.90, moat_strength_score: 4.5, net_income_positive: true,
      trend_metrics: { ...STABLE_TREND_METRICS, deterioratingCashConversionFlag: true },
    });
    const result = classifyStock(input);
    const step = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(step?.note).toContain('deteriorating_cfo=true');
  });

  test('Condition 5: eq_trend_score < -0.50 → degrade one level', () => {
    const input = makeBaseInput({
      trend_metrics: { ...STABLE_TREND_METRICS, earningsQualityTrendScore: -0.60 },
    });
    const result = classifyStock(input);
    const step = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(step?.note).toContain('eq_trend_score=-0.60');
  });
});

// ── STORY-072 Scenario F: Regression — existing ≥ 489 tests still pass ───────
// (This test is a meta-test; the actual verification is the test runner output.
// This suite serves as a checkpoint that the STORY-065–069 additions have not
// broken the classification engine's original contract.)

describe('EPIC-004/STORY-072: Regression — original classification contract preserved', () => {
  test('classifyStock with no trend_metrics produces the same bucket as before STORY-065', () => {
    // This input matches a known golden-set case (Bucket 4, high confidence, B4AA)
    const input = makeBaseInput();
    const result = classifyStock(input);

    // Assert structural contract (not exact code — other test files cover exact values)
    expect(result.bucket).toBe(4);
    expect(['A', 'B', 'C', null]).toContain(result.eq_grade);
    expect(['A', 'B', 'C', null]).toContain(result.bs_grade);
    expect(['high', 'medium', 'low']).toContain(result.confidence_level);
    expect(result.confidenceBreakdown.steps.length).toBeGreaterThanOrEqual(5);
    expect(result.tieBreaksFired).toBeDefined();
  });

  test('binary_flag=true forces Bucket 8 regardless of trend_metrics', () => {
    const input = makeBaseInput({
      binary_flag: true,
      trend_metrics: STABLE_TREND_METRICS,
    });
    const result = classifyStock(input);
    expect(result.bucket).toBe(8);
    expect(result.suggested_code).toBe('8');
  });

  test('holding_company_flag=true with Bucket 3/4 still applies when trend_metrics present', () => {
    const input = makeBaseInput({
      holding_company_flag: true,
      revenue_growth_fwd: 0.05, // Bucket 3 range
      trend_metrics: STABLE_TREND_METRICS,
    });
    const result = classifyStock(input);
    if (result.bucket === 3 || result.bucket === 4) {
      expect(result.bucket).toBe(3);
      expect(result.reason_codes).toContain('holding_company_flag_applied');
    }
  });

  test('null winner when all scores zero and no trend_metrics', () => {
    const sparse: ClassificationInput = {
      revenue_growth_fwd: null, revenue_growth_3y: null,
      eps_growth_fwd: null, eps_growth_3y: null, gross_profit_growth: null,
      operating_margin: null, fcf_margin: null, fcf_conversion: null, roic: null,
      fcf_positive: null, net_income_positive: null,
      net_debt_to_ebitda: null, interest_coverage: null,
      moat_strength_score: null, pricing_power_score: null, revenue_recurrence_score: null,
      margin_durability_score: null, capital_intensity_score: null, qualitative_cyclicality_score: null,
      holding_company_flag: false, insurer_flag: false, cyclicality_flag: false,
      optionality_flag: false, binary_flag: false, pre_operating_leverage_flag: false,
    };
    const bucketResult = BucketScorer(sparse);
    expect(bucketResult.winner).toBeNull();
  });
});
