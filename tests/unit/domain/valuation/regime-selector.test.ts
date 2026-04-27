// EPIC-008: Valuation Regime Decoupling
// STORY-092: RegimeSelectorService
// TASK-092-003: Unit tests — all regime paths + edge cases

import { selectRegime } from '../../../../src/domain/valuation/regime-selector';
import type { RegimeSelectorInput } from '../../../../src/domain/valuation/types';

// ── Base input factories ──────────────────────────────────────────────────────

function base(): RegimeSelectorInput {
  return {
    activeCode: '4AA',
    bankFlag: false,
    insurerFlag: false,
    holdingCompanyFlag: false,
    preOperatingLeverageFlag: false,
    netIncomeTtm: 1_000_000_000,      // positive
    freeCashFlowTtm: 800_000_000,     // positive
    operatingMarginTtm: 0.30,
    grossMarginTtm: 0.70,
    fcfConversionTtm: 0.80,
    revenueGrowthFwd: 0.25,
    structuralCyclicalityScore: 0,
  };
}

function nvda(): RegimeSelectorInput {
  return {
    ...base(),
    activeCode: '4AA',
    operatingMarginTtm: 0.65,
    grossMarginTtm: 0.75,
    revenueGrowthFwd: 0.70,
    fcfConversionTtm: 0.81,
    structuralCyclicalityScore: 2,
  };
}

function wmt(): RegimeSelectorInput {
  return {
    ...base(),
    activeCode: '2AA',
    operatingMarginTtm: 0.0447,  // WMT-like: 4.47%
    grossMarginTtm: 0.25,
    revenueGrowthFwd: 0.05,      // 5% growth — below 10% threshold
    fcfConversionTtm: 0.70,
    structuralCyclicalityScore: 0,
  };
}

function mu(): RegimeSelectorInput {
  return {
    ...base(),
    activeCode: '3AA',
    operatingMarginTtm: 0.20,
    revenueGrowthFwd: 0.10,
    fcfConversionTtm: 0.40,  // below 0.60 — Step 2 fails
    structuralCyclicalityScore: 2,
  };
}

// ── ADR-017 Step 0A: Bucket 8 ─────────────────────────────────────────────────

describe('ADR-017 Step 0A: Bucket 8', () => {
  test('bucket 8 → not_applicable', () => {
    expect(selectRegime({ ...base(), activeCode: '8CC' })).toBe('not_applicable');
  });
});

// ── ADR-017 Step 0B: Bank flag ────────────────────────────────────────────────

describe('ADR-017 Step 0B: Bank flag', () => {
  test('bankFlag=true → manual_required regardless of financials (JPM-like)', () => {
    expect(selectRegime({ ...nvda(), bankFlag: true })).toBe('manual_required');
  });

  test('bankFlag=false + all other flags false → not manual_required from Step 0B', () => {
    const result = selectRegime(nvda());
    expect(result).not.toBe('manual_required');
  });
});

// ── ADR-017 Step 0C: Insurer flag ─────────────────────────────────────────────

describe('ADR-017 Step 0C: Insurer flag', () => {
  test('insurerFlag=true → financial_special_case', () => {
    expect(selectRegime({ ...base(), insurerFlag: true })).toBe('financial_special_case');
  });

  test('insurerFlag + holdingCompanyFlag both true → financial_special_case (insurer fires first)', () => {
    expect(selectRegime({ ...base(), insurerFlag: true, holdingCompanyFlag: true })).toBe(
      'financial_special_case',
    );
  });
});

// ── ADR-017 Step 0D: Holding company flag ────────────────────────────────────

describe('ADR-017 Step 0D: Holding company flag', () => {
  test('holdingCompanyFlag=true → financial_special_case (BRK-like)', () => {
    expect(selectRegime({ ...base(), holdingCompanyFlag: true })).toBe('financial_special_case');
  });
});

// ── ADR-017 Step 1: Sales-valued path ────────────────────────────────────────

describe('ADR-017 Step 1: Sales-valued path', () => {
  test('net_income_negative → sales_growth_standard', () => {
    expect(
      selectRegime({ ...base(), netIncomeTtm: -100_000_000, revenueGrowthFwd: 0.25 }),
    ).toBe('sales_growth_standard');
  });

  test('net_income=0 → treated as not positive → sales_growth_standard', () => {
    expect(selectRegime({ ...base(), netIncomeTtm: 0 })).toBe('sales_growth_standard');
  });

  test('hyper-growth: rev_growth≥40%, gross_margin≥70% → sales_growth_hyper', () => {
    expect(
      selectRegime({ ...base(), netIncomeTtm: -50_000_000, revenueGrowthFwd: 0.50, grossMarginTtm: 0.75 }),
    ).toBe('sales_growth_hyper');
  });

  test('hyper-growth conditions but gross_margin < 0.70 → sales_growth_standard', () => {
    expect(
      selectRegime({ ...base(), netIncomeTtm: -50_000_000, revenueGrowthFwd: 0.50, grossMarginTtm: 0.65 }),
    ).toBe('sales_growth_standard');
  });

  test('op_margin < 0.10 AND rev_growth >= 0.10 → Step 1 fires → sales_growth_standard', () => {
    expect(
      selectRegime({ ...base(), operatingMarginTtm: 0.04, revenueGrowthFwd: 0.15 }),
    ).toBe('sales_growth_standard');
  });

  test('WMT-fix: op_margin 4.47% but rev_growth 5% < 10% → Step 1 does NOT fire → mature_pe', () => {
    expect(selectRegime(wmt())).toBe('mature_pe');
  });

  test('op_margin = exactly 0.10 → Step 1 condition does NOT fire (requires < 0.10)', () => {
    const result = selectRegime({
      ...base(),
      operatingMarginTtm: 0.10,
      revenueGrowthFwd: 0.15,
      structuralCyclicalityScore: 0,
      fcfConversionTtm: 0.40,
      revenueGrowthFwd: 0.10,  // below Step 2 (need 0.20) but above Step 1 rev threshold
    });
    // Step 1 op_margin condition requires < 0.10; 0.10 does not fire
    // Step 2 requires rev_growth >= 0.20; 0.10 fails
    // Falls to Step 3, 4, or 5
    expect(result).not.toBe('sales_growth_standard');
    expect(result).not.toBe('sales_growth_hyper');
  });

  test('preOperatingLeverageFlag=true → Step 1 fires regardless of margins', () => {
    expect(
      selectRegime({ ...nvda(), preOperatingLeverageFlag: true }),
    ).not.toBe('profitable_growth_pe');
  });
});

// ── ADR-017 Step 2: Profitable high-growth PE ─────────────────────────────────

describe('ADR-017 Step 2: Profitable high-growth PE', () => {
  test('NVDA-like (score=2): all conditions → profitable_growth_pe', () => {
    expect(selectRegime(nvda())).toBe('profitable_growth_pe');
  });

  test('NVDA-like with score=3 → cyclical_earnings (score-3 override)', () => {
    expect(selectRegime({ ...nvda(), structuralCyclicalityScore: 3 })).toBe('cyclical_earnings');
  });

  test('rev_growth_fwd=null → Step 2 fails', () => {
    const result = selectRegime({ ...nvda(), revenueGrowthFwd: null });
    expect(result).not.toBe('profitable_growth_pe');
  });

  test('fcf_conversion=null → Step 2 fails', () => {
    const result = selectRegime({ ...nvda(), fcfConversionTtm: null });
    expect(result).not.toBe('profitable_growth_pe');
  });

  test('op_margin = exactly 0.25 → Step 2 fires (boundary inclusive)', () => {
    expect(selectRegime({ ...nvda(), operatingMarginTtm: 0.25 })).toBe('profitable_growth_pe');
  });

  test('op_margin = 0.249 → Step 2 fails (below 0.25)', () => {
    const result = selectRegime({ ...nvda(), operatingMarginTtm: 0.249 });
    expect(result).not.toBe('profitable_growth_pe');
  });

  test('rev_growth = exactly 0.20 → Step 2 fires (boundary inclusive)', () => {
    expect(selectRegime({ ...nvda(), revenueGrowthFwd: 0.20 })).toBe('profitable_growth_pe');
  });
});

// ── ADR-017 Step 3: Cyclical earnings ────────────────────────────────────────

describe('ADR-017 Step 3: Cyclical earnings', () => {
  test('MU-like: profitable, score=2, fcf_conv too low for Step 2 → cyclical_earnings', () => {
    expect(selectRegime(mu())).toBe('cyclical_earnings');
  });

  test('score=0 → Step 3 does not fire', () => {
    const result = selectRegime({
      ...mu(),
      structuralCyclicalityScore: 0,
      revenueGrowthFwd: 0.05,   // below Step 2 and Step 4 thresholds
      fcfConversionTtm: 0.40,   // below Step 2 threshold
      operatingMarginTtm: 0.12, // above 0.10
    });
    // Should fall through Step 3 (score=0 fails), reach Step 4 or 5
    expect(result).not.toBe('cyclical_earnings');
  });

  test('score=1, profitable, op_margin ≥ 0.10 → cyclical_earnings', () => {
    expect(
      selectRegime({ ...base(), structuralCyclicalityScore: 1, revenueGrowthFwd: 0.05, fcfConversionTtm: 0.40 }),
    ).toBe('cyclical_earnings');
  });
});

// ── ADR-017 Step 4: Profitable transitional EV/EBIT ──────────────────────────

describe('ADR-017 Step 4: Profitable transitional EV/EBIT', () => {
  test('transitional: op_margin 15%, rev_growth 20%, net/fcf positive → profitable_growth_ev_ebit', () => {
    expect(
      selectRegime({
        ...base(),
        operatingMarginTtm: 0.15,
        revenueGrowthFwd: 0.20,
        structuralCyclicalityScore: 0,
        fcfConversionTtm: 0.40,   // below Step 2 threshold (0.60)
      }),
    ).toBe('profitable_growth_ev_ebit');
  });

  test('rev_growth_fwd = null → Step 4 fails', () => {
    const result = selectRegime({
      ...base(),
      operatingMarginTtm: 0.15,
      revenueGrowthFwd: null,
      structuralCyclicalityScore: 0,
      fcfConversionTtm: 0.40,
    });
    expect(result).not.toBe('profitable_growth_ev_ebit');
  });

  test('op_margin >= 0.25 → Step 4 fails (out of range)', () => {
    const result = selectRegime({
      ...base(),
      operatingMarginTtm: 0.25,
      revenueGrowthFwd: 0.15,
      structuralCyclicalityScore: 0,
      fcfConversionTtm: 0.40,
    });
    expect(result).not.toBe('profitable_growth_ev_ebit');
  });
});

// ── ADR-017 Step 5: Mature PE ─────────────────────────────────────────────────

describe('ADR-017 Step 5: Mature PE', () => {
  test('WMT-like: profitable, low growth → mature_pe', () => {
    expect(selectRegime(wmt())).toBe('mature_pe');
  });

  test('profitable + fcf_positive + no other conditions → mature_pe', () => {
    expect(
      selectRegime({
        ...base(),
        revenueGrowthFwd: 0.05,
        operatingMarginTtm: 0.08,  // below cyclical threshold
        structuralCyclicalityScore: 0,
        fcfConversionTtm: 0.40,
      }),
    ).toBe('mature_pe');
  });
});

// ── ADR-017 Step 6: Catch-all ─────────────────────────────────────────────────

describe('ADR-017 Step 6: Catch-all', () => {
  // Step 6 fires: net_income positive (so Step 1 doesn't fire from !netIncomePositive),
  // fcf negative (Step 5 fails), low growth (Step 2/4 fail), low margin (Step 3 fails at < 0.10).
  test('profitable but negative FCF + low margin/growth → manual_required (Step 6)', () => {
    expect(
      selectRegime({
        ...base(),
        netIncomeTtm: 100_000_000,       // income positive (Step 1 !netIncomePositive is false)
        freeCashFlowTtm: -50_000_000,    // fcf negative → Step 5 fails
        operatingMarginTtm: 0.08,        // below 0.10 → Step 3 fails; below threshold for Step 4
        revenueGrowthFwd: 0.05,          // below 0.10 → Step 1 op_margin condition doesn't fire; Step 2/4 fail
        structuralCyclicalityScore: 0,
      }),
    ).toBe('manual_required');
  });

  test('netIncomePositive=true but fcfPositive=false + other steps fail → manual_required', () => {
    const result = selectRegime({
      ...base(),
      freeCashFlowTtm: -10_000_000,  // fcf negative → Step 5 fails
      revenueGrowthFwd: 0.05,        // below Step 2 (0.20) and Step 4 (0.15) thresholds
      operatingMarginTtm: 0.08,      // below 0.10 → Step 3/4 fail
      structuralCyclicalityScore: 0,
    });
    expect(result).toBe('manual_required');
  });
});

// ── All 9 regimes reachable ───────────────────────────────────────────────────

describe('All 9 ValuationRegime values reachable', () => {
  const results = new Set([
    selectRegime({ ...base(), activeCode: '8CC' }),                          // not_applicable
    selectRegime({ ...base(), bankFlag: true }),                             // manual_required
    selectRegime({ ...base(), insurerFlag: true }),                          // financial_special_case
    selectRegime({ ...base(), netIncomeTtm: -100_000_000, grossMarginTtm: 0.75, revenueGrowthFwd: 0.50 }), // sales_growth_hyper
    selectRegime({ ...base(), netIncomeTtm: -100_000_000, revenueGrowthFwd: 0.20 }), // sales_growth_standard
    selectRegime(nvda()),                                                    // profitable_growth_pe
    selectRegime(mu()),                                                      // cyclical_earnings
    selectRegime({ ...base(), operatingMarginTtm: 0.15, revenueGrowthFwd: 0.20, fcfConversionTtm: 0.40, structuralCyclicalityScore: 0 }), // profitable_growth_ev_ebit
    selectRegime(wmt()),                                                     // mature_pe
  ]);

  test('all 9 distinct regimes are reachable in test suite', () => {
    expect(results.size).toBe(9);
    expect(results).toContain('not_applicable');
    expect(results).toContain('manual_required');
    expect(results).toContain('financial_special_case');
    expect(results).toContain('sales_growth_hyper');
    expect(results).toContain('sales_growth_standard');
    expect(results).toContain('profitable_growth_pe');
    expect(results).toContain('cyclical_earnings');
    expect(results).toContain('profitable_growth_ev_ebit');
    expect(results).toContain('mature_pe');
  });
});
