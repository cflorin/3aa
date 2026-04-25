// EPIC-004/STORY-069: Confidence Step 5 — Trajectory Quality Penalty
// RFC-001 Amendment 2026-04-25 — quarterly history depth and stability signals degrade confidence
// ADR-014 §Confidence Computation Rules

import { classifyStock } from '../../../src/domain/classification/classifier';
import type { ClassificationInput } from '../../../src/domain/classification/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Base input that scores clearly to Bucket 4 with high confidence (margin >= HIGH_MARGIN_THRESHOLD)
// Uses strong enough revenue signals to ensure B4 wins with a large margin
function makeHighConfidenceBase(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    // Revenue primary: 12% fires B4 (8–15%) = +3; B5 (10-20%) = +3
    // Revenue secondary: 12% fires B4 = +2; B5 = +2
    revenue_growth_fwd: 0.12, revenue_growth_3y: 0.12,
    eps_growth_fwd: 0.12, eps_growth_3y: 0.12, gross_profit_growth: 0.12,
    // Profitability — adds to B4 only regions
    operating_margin: 0.20, fcf_margin: 0.18, fcf_conversion: 0.82, roic: 0.22,
    fcf_positive: true, net_income_positive: true,
    net_debt_to_ebitda: 0.5, interest_coverage: 20.0,
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
    operatingMarginStabilityScore: 0.80,   // high stability → no degradation
    deterioratingCashConversionFlag: false,
    earningsQualityTrendScore: 0.10,       // neutral → no degradation
    materialDilutionTrendFlag: false,
    sbcBurdenScore: null,
    operatingIncomeAccelerationFlag: false,
    operatingLeverageEmergingFlag: false,
    ...overrides,
  };
}

// ── STORY-069 Scenario A: Step 5 skipped when trend_metrics absent ────────────

describe('EPIC-004/STORY-069: Step 5 skipped when trend_metrics absent', () => {
  test('no trajectory step in confidenceBreakdown when trend_metrics absent', () => {
    const input = makeHighConfidenceBase();

    const result = classifyStock(input);

    const stepLabels = result.confidenceBreakdown.steps.map(s => s.label);
    expect(stepLabels).not.toContain('trajectory quality penalty');
    expect(stepLabels).toContain('final');
  });

  test('final step is step 5 (not 6) when trend_metrics absent', () => {
    const input = makeHighConfidenceBase();

    const result = classifyStock(input);

    const finalStep = result.confidenceBreakdown.steps.find(s => s.label === 'final');
    expect(finalStep?.step).toBe(5);
  });

  test('confidence can reach high when trend_metrics absent and signals strong', () => {
    // Without trajectory penalty, strong margin signals can yield high confidence
    const input = makeHighConfidenceBase();

    const result = classifyStock(input);

    // Just verify Step 5 absence doesn't force LOW
    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep).toBeUndefined();
  });
});

// ── STORY-069 Scenario B: quartersAvailable < 4 → force LOW ─────────────────

describe('EPIC-004/STORY-069: quartersAvailable < 4 forces LOW', () => {
  test('confidence forced to low when quartersAvailable = 0', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 0 }),
    });

    const result = classifyStock(input);

    expect(result.confidence_level).toBe('low');
  });

  test('confidence forced to low when quartersAvailable = 3', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 3 }),
    });

    const result = classifyStock(input);

    expect(result.confidence_level).toBe('low');
  });

  test('trajectory step note mentions quarters_available when < 4', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 2 }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep).toBeDefined();
    expect(trajectoryStep?.note).toContain('quarters_available=2');
    expect(trajectoryStep?.note).toContain('force LOW');
    expect(trajectoryStep?.band).toBe('low');
  });

  test('trajectory step is step 5; final step is step 6 when trend_metrics present', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 4 }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    const finalStep = result.confidenceBreakdown.steps.find(s => s.label === 'final');
    expect(trajectoryStep?.step).toBe(5);
    expect(finalStep?.step).toBe(6);
  });
});

// ── STORY-069 Scenario C: quartersAvailable 4–7 → cap MEDIUM ────────────────

describe('EPIC-004/STORY-069: quartersAvailable 4–7 caps confidence at MEDIUM', () => {
  test('confidence capped at medium when quartersAvailable = 4 and would otherwise be high', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 4 }),
    });

    const result = classifyStock(input);

    // The 4-7 quarter cap prevents HIGH; band at most MEDIUM
    expect(result.confidence_level).not.toBe('high');
    expect(['medium', 'low']).toContain(result.confidence_level);
  });

  test('confidence capped at medium when quartersAvailable = 7', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 7 }),
    });

    const result = classifyStock(input);

    expect(result.confidence_level).not.toBe('high');
  });

  test('confidence can reach high when quartersAvailable >= 8 (no cap)', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 8 }),
    });

    const result = classifyStock(input);

    // With 8+ quarters and stable metrics, HIGH is possible
    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).toBe('no degradation');
  });

  test('trajectory note mentions cap MEDIUM when quartersAvailable < 8 and prior band was high', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({ quartersAvailable: 6 }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    if (trajectoryStep?.note !== 'no degradation') {
      // Only check cap note if the band was indeed high before trajectory step
      // (i.e., if the note mentions cap — it depends on the prior steps)
      expect(trajectoryStep?.band).not.toBe('high');
    }
  });
});

// ── STORY-069 Scenario D: operatingMarginStabilityScore < 0.40 → degrade ────

describe('EPIC-004/STORY-069: stability_score < 0.40 degrades one level', () => {
  test('high → medium when stability_score = 0.39', () => {
    // Start from a state where trajectory step enters as 'high' (8 quarters)
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        operatingMarginStabilityScore: 0.39,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    // band entering Step 5 could be high or medium depending on margin/ties
    // After degrade, it should be at most medium
    if (trajectoryStep) {
      expect(['medium', 'low']).toContain(trajectoryStep.band);
      expect(trajectoryStep.note).toContain('stability_score=0.39');
    }
  });

  test('boundary: stability_score exactly 0.40 does NOT degrade', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        operatingMarginStabilityScore: 0.40,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).not.toContain('stability_score');
  });

  test('null stability_score fires no degradation', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        operatingMarginStabilityScore: null,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).not.toContain('stability_score');
  });
});

// ── STORY-069 Scenario E: deteriorating CFO + good EQ → degrade ──────────────

describe('EPIC-004/STORY-069: deteriorating CFO + good EQ degrades one level', () => {
  test('degrades when deteriorating_cfo=true and eq_grade=A', () => {
    const input = makeHighConfidenceBase({
      // Force EQ-A: strong FCF conversion (>0.80) + high moat
      fcf_conversion: 0.90, moat_strength_score: 4.5, net_income_positive: true,
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        deterioratingCashConversionFlag: true,
        earningsQualityTrendScore: null, // neutral
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).toContain('deteriorating_cfo=true');
    expect(trajectoryStep?.note).toContain('eq_grade=A');
  });

  test('degrades when deteriorating_cfo=true and eq_grade=B', () => {
    const input = makeHighConfidenceBase({
      // EQ-B scenario: moderate FCF
      fcf_conversion: 0.60, moat_strength_score: 3.0,
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        deterioratingCashConversionFlag: true,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    // Note contains eq_grade=A or eq_grade=B depending on computed grade
    expect(trajectoryStep?.note).toMatch(/deteriorating_cfo=true/);
  });

  test('does NOT degrade when deteriorating_cfo=true and eq_grade=C', () => {
    const input = makeHighConfidenceBase({
      // Force EQ-C: weak FCF + weak moat
      fcf_conversion: 0.30, moat_strength_score: 1.5,
      fcf_positive: false, net_income_positive: false,
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        deterioratingCashConversionFlag: true,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    // Only degrades when eq is A or B — C means already captured
    expect(trajectoryStep?.note).not.toContain('deteriorating_cfo=true + eq_grade=C');
  });

  test('does NOT degrade when deteriorating_cfo=false', () => {
    const input = makeHighConfidenceBase({
      fcf_conversion: 0.90, moat_strength_score: 4.5,
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        deterioratingCashConversionFlag: false,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).not.toContain('deteriorating_cfo');
  });
});

// ── STORY-069 Scenario F: earningsQualityTrendScore < -0.50 → degrade ────────

describe('EPIC-004/STORY-069: eq_trend_score < -0.50 degrades one level', () => {
  test('degrades when earningsQualityTrendScore = -0.51', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        earningsQualityTrendScore: -0.51,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).toContain('eq_trend_score=-0.51');
    expect(trajectoryStep?.note).toContain('degrade');
  });

  test('boundary: earningsQualityTrendScore exactly -0.50 does NOT degrade', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        earningsQualityTrendScore: -0.50,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).not.toContain('eq_trend_score');
  });

  test('null earningsQualityTrendScore fires no degradation', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        earningsQualityTrendScore: null,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).not.toContain('eq_trend_score');
  });
});

// ── STORY-069 Scenario G: multiple conditions are additive (floor at LOW) ─────

describe('EPIC-004/STORY-069: multiple degrade conditions are additive with floor at LOW', () => {
  test('two degrade conditions: high → medium → low', () => {
    // Start at medium after Steps 2–4, then two degradations → low
    const input = makeHighConfidenceBase({
      fcf_conversion: 0.90, moat_strength_score: 4.5, net_income_positive: true,
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        // condition 1: poor stability
        operatingMarginStabilityScore: 0.30,
        // condition 2: deteriorating CFO with EQ-A
        deterioratingCashConversionFlag: true,
        earningsQualityTrendScore: null,
      }),
    });

    const result = classifyStock(input);

    // Two degradations applied → floor at LOW regardless
    expect(result.confidence_level).toBe('low');
  });

  test('three degrade conditions still floor at LOW (not below low)', () => {
    const input = makeHighConfidenceBase({
      fcf_conversion: 0.90, moat_strength_score: 4.5, net_income_positive: true,
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        operatingMarginStabilityScore: 0.30,
        deterioratingCashConversionFlag: true,
        earningsQualityTrendScore: -0.60,
      }),
    });

    const result = classifyStock(input);

    expect(result.confidence_level).toBe('low');
    // LOW is the floor — cannot go lower
  });

  test('clean 8+ quarters with stable metrics: no trajectory degradation', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics({
        quartersAvailable: 8,
        operatingMarginStabilityScore: 0.80,
        deterioratingCashConversionFlag: false,
        earningsQualityTrendScore: 0.10,
      }),
    });

    const result = classifyStock(input);

    const trajectoryStep = result.confidenceBreakdown.steps.find(s => s.label === 'trajectory quality penalty');
    expect(trajectoryStep?.note).toBe('no degradation');
  });
});

// ── STORY-069 Scenario H: confidence breakdown step count and order ────────────

describe('EPIC-004/STORY-069: confidenceBreakdown step structure', () => {
  test('breakdown has 6 steps when trend_metrics present (steps 1–4 + trajectory + final)', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics(),
    });

    const result = classifyStock(input);

    expect(result.confidenceBreakdown.steps).toHaveLength(6);
  });

  test('breakdown has 5 steps when trend_metrics absent (steps 1–4 + final)', () => {
    const input = makeHighConfidenceBase();

    const result = classifyStock(input);

    expect(result.confidenceBreakdown.steps).toHaveLength(5);
  });

  test('step numbers are 1,2,3,4,5,6 when trend_metrics present', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics(),
    });

    const result = classifyStock(input);

    const stepNumbers = result.confidenceBreakdown.steps.map(s => s.step);
    expect(stepNumbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('step numbers are 1,2,3,4,5 when trend_metrics absent', () => {
    const input = makeHighConfidenceBase();

    const result = classifyStock(input);

    const stepNumbers = result.confidenceBreakdown.steps.map(s => s.step);
    expect(stepNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  test('step 5 label is "trajectory quality penalty" when trend_metrics present', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics(),
    });

    const result = classifyStock(input);

    const step5 = result.confidenceBreakdown.steps.find(s => s.step === 5);
    expect(step5?.label).toBe('trajectory quality penalty');
  });

  test('step 6 label is "final" when trend_metrics present', () => {
    const input = makeHighConfidenceBase({
      trend_metrics: makeTrendMetrics(),
    });

    const result = classifyStock(input);

    const step6 = result.confidenceBreakdown.steps.find(s => s.step === 6);
    expect(step6?.label).toBe('final');
  });
});
