// EPIC-008: Valuation Regime Decoupling
// STORY-096: EPIC-008 Regression & Integration Tests
// TASK-096-001: Golden-set BDD tests — Scenarios A + B (NVDA-like)
// TASK-096-002: Golden-set BDD tests — Scenarios C + D + E

import { selectRegime } from '../../../../src/domain/valuation/regime-selector';
import { assignThresholdsRegimeDriven } from '../../../../src/domain/valuation/threshold-assigner';
import type { RegimeSelectorInput, ValuationRegimeThresholdRow } from '../../../../src/domain/valuation/types';
import type { RegimeDrivenThresholdInput } from '../../../../src/domain/valuation/threshold-assigner';

// ── Test threshold table (mirrors seed data) ─────────────────────────────────

const TEST_THRESHOLDS: ValuationRegimeThresholdRow[] = [
  { regime: 'mature_pe',                 primaryMetric: 'forward_pe',       maxThreshold: 22,  comfortableThreshold: 20,  veryGoodThreshold: 18,  stealThreshold: 16  },
  { regime: 'profitable_growth_pe',      primaryMetric: 'forward_pe',       maxThreshold: 36,  comfortableThreshold: 30,  veryGoodThreshold: 24,  stealThreshold: 18  },
  { regime: 'profitable_growth_ev_ebit', primaryMetric: 'forward_ev_ebit',  maxThreshold: 24,  comfortableThreshold: 20,  veryGoodThreshold: 16,  stealThreshold: 12  },
  { regime: 'cyclical_earnings',         primaryMetric: 'forward_ev_ebit',  maxThreshold: 16,  comfortableThreshold: 13,  veryGoodThreshold: 10,  stealThreshold: 7   },
  { regime: 'sales_growth_standard',     primaryMetric: 'ev_sales',         maxThreshold: 12,  comfortableThreshold: 10,  veryGoodThreshold: 8,   stealThreshold: 6   },
  { regime: 'sales_growth_hyper',        primaryMetric: 'ev_sales',         maxThreshold: 20,  comfortableThreshold: 16,  veryGoodThreshold: 12,  stealThreshold: 8   },
  { regime: 'financial_special_case',    primaryMetric: 'forward_pe',       maxThreshold: null, comfortableThreshold: null, veryGoodThreshold: null, stealThreshold: null },
  { regime: 'manual_required',           primaryMetric: 'forward_pe',       maxThreshold: null, comfortableThreshold: null, veryGoodThreshold: null, stealThreshold: null },
  { regime: 'not_applicable',            primaryMetric: 'forward_pe',       maxThreshold: null, comfortableThreshold: null, veryGoodThreshold: null, stealThreshold: null },
];

// ── Input factories ───────────────────────────────────────────────────────────

function nvdaRegimeInput(): RegimeSelectorInput {
  return {
    activeCode: '4AA',
    bankFlag: false,
    insurerFlag: false,
    holdingCompanyFlag: false,
    preOperatingLeverageFlag: false,
    netIncomeTtm: 15_000_000_000,
    freeCashFlowTtm: 12_000_000_000,
    operatingMarginTtm: 0.65,
    grossMarginTtm: 0.75,
    fcfConversionTtm: 0.81,
    revenueGrowthFwd: 0.70,
    structuralCyclicalityScore: 2,
  };
}

function nvdaThresholdInput(cyclePosition: RegimeDrivenThresholdInput['cyclePosition']): RegimeDrivenThresholdInput {
  return {
    regime: 'profitable_growth_pe',
    thresholds: TEST_THRESHOLDS,
    activeCode: '4AA',
    revenueGrowthFwd: 0.70,
    structuralCyclicalityScore: 2,
    cyclePosition,
    grossMarginTtm: 0.75,
  };
}

function wmtRegimeInput(): RegimeSelectorInput {
  return {
    activeCode: '2AA',
    bankFlag: false,
    insurerFlag: false,
    holdingCompanyFlag: false,
    preOperatingLeverageFlag: false,
    netIncomeTtm: 5_000_000_000,
    freeCashFlowTtm: 4_000_000_000,
    operatingMarginTtm: 0.0447,
    grossMarginTtm: 0.25,
    fcfConversionTtm: 0.70,
    revenueGrowthFwd: 0.05,
    structuralCyclicalityScore: 0,
  };
}

function muRegimeInput(): RegimeSelectorInput {
  return {
    activeCode: '3AA',
    bankFlag: false,
    insurerFlag: false,
    holdingCompanyFlag: false,
    preOperatingLeverageFlag: false,
    netIncomeTtm: 3_000_000_000,
    freeCashFlowTtm: 1_200_000_000,
    operatingMarginTtm: 0.20,
    grossMarginTtm: 0.55,
    fcfConversionTtm: 0.40,
    revenueGrowthFwd: 0.10,
    structuralCyclicalityScore: 2,
  };
}

function jpmRegimeInput(): RegimeSelectorInput {
  return {
    activeCode: '3AA',
    bankFlag: true,
    insurerFlag: false,
    holdingCompanyFlag: false,
    preOperatingLeverageFlag: false,
    netIncomeTtm: 50_000_000_000,
    freeCashFlowTtm: 40_000_000_000,
    operatingMarginTtm: 0.30,
    grossMarginTtm: 0.60,
    fcfConversionTtm: 0.80,
    revenueGrowthFwd: 0.07,
    structuralCyclicalityScore: 0,
  };
}

// ── Scenario A: NVDA-like profitable_growth_pe, high tier, score=2, normal cycle, A/A ───

describe('Scenario A: NVDA-like profitable_growth_pe, high tier, normal cycle, A/A', () => {
  it('selectRegime → profitable_growth_pe', () => {
    expect(selectRegime(nvdaRegimeInput())).toBe('profitable_growth_pe');
  });

  it('regime-driven thresholds → 32/26/20/14', () => {
    const r = assignThresholdsRegimeDriven(nvdaThresholdInput('normal'));
    expect(r.maxThreshold).toBe(32);
    expect(r.comfortableThreshold).toBe(26);
    expect(r.veryGoodThreshold).toBe(20);
    expect(r.stealThreshold).toBe(14);
  });

  it('growthTier = high (rev_growth=70% ≥ 35%)', () => {
    expect(assignThresholdsRegimeDriven(nvdaThresholdInput('normal')).growthTier).toBe('high');
  });

  it('cyclicalOverlayValue = 4.0 (magnitude; thresholds tightened by 4; score=2, normal)', () => {
    const r = assignThresholdsRegimeDriven(nvdaThresholdInput('normal'));
    expect(r.cyclicalOverlayApplied).toBe(true);
    expect(r.cyclicalOverlayValue).toBe(4);
  });
});

// ── Scenario B: NVDA-like, elevated cycle ────────────────────────────────────

describe('Scenario B: NVDA-like profitable_growth_pe, high tier, elevated cycle, A/A', () => {
  it('selectRegime → profitable_growth_pe (unchanged by cycle position)', () => {
    expect(selectRegime(nvdaRegimeInput())).toBe('profitable_growth_pe');
  });

  it('regime-driven thresholds → 30/24/18/12', () => {
    const r = assignThresholdsRegimeDriven(nvdaThresholdInput('elevated'));
    expect(r.maxThreshold).toBe(30);
    expect(r.comfortableThreshold).toBe(24);
    expect(r.veryGoodThreshold).toBe(18);
    expect(r.stealThreshold).toBe(12);
  });

  it('cyclicalOverlayValue = 6.0 (magnitude; thresholds tightened by 6; score=2, elevated)', () => {
    const r = assignThresholdsRegimeDriven(nvdaThresholdInput('elevated'));
    expect(r.cyclicalOverlayValue).toBe(6);
  });
});

// ── Scenario C: WMT-like mature_pe, A/A, score=0 ─────────────────────────────

describe('Scenario C: WMT-like mature_pe, A/A, score=0', () => {
  it('selectRegime → mature_pe (low margin <10% but growth <10% means Step 1 does NOT fire; reaches Step 5)', () => {
    expect(selectRegime(wmtRegimeInput())).toBe('mature_pe');
  });

  it('regime-driven thresholds → 22/20/18/16 (no overlay, A/A quality)', () => {
    const r = assignThresholdsRegimeDriven({
      regime: 'mature_pe',
      thresholds: TEST_THRESHOLDS,
      activeCode: '2AA',
      revenueGrowthFwd: 0.05,
      structuralCyclicalityScore: 0,
      cyclePosition: 'normal',
      grossMarginTtm: 0.25,
    });
    expect(r.maxThreshold).toBe(22);
    expect(r.comfortableThreshold).toBe(20);
    expect(r.veryGoodThreshold).toBe(18);
    expect(r.stealThreshold).toBe(16);
  });

  it('growthTier = null (mature_pe does not use growth tier)', () => {
    const r = assignThresholdsRegimeDriven({
      regime: 'mature_pe',
      thresholds: TEST_THRESHOLDS,
      activeCode: '2AA',
      revenueGrowthFwd: 0.05,
      structuralCyclicalityScore: 0,
      cyclePosition: 'normal',
      grossMarginTtm: null,
    });
    expect(r.growthTier).toBeNull();
  });

  it('no cyclical overlay (score=0)', () => {
    const r = assignThresholdsRegimeDriven({
      regime: 'mature_pe',
      thresholds: TEST_THRESHOLDS,
      activeCode: '2AA',
      revenueGrowthFwd: 0.05,
      structuralCyclicalityScore: 0,
      cyclePosition: 'normal',
      grossMarginTtm: null,
    });
    expect(r.cyclicalOverlayApplied).toBe(false);
    expect(r.cyclicalOverlayValue).toBeNull();
  });
});

// ── Scenario D: MU-like cyclical_earnings, A/A, elevated ─────────────────────

describe('Scenario D: MU-like cyclical_earnings, A/A, elevated cycle', () => {
  it('selectRegime → cyclical_earnings (Step 2 fails: fcf_conversion<0.60; Step 3 fires: score≥1, NI+, op_margin≥0.10)', () => {
    expect(selectRegime(muRegimeInput())).toBe('cyclical_earnings');
  });

  it('regime-driven thresholds → 14/11/8/5', () => {
    const r = assignThresholdsRegimeDriven({
      regime: 'cyclical_earnings',
      thresholds: TEST_THRESHOLDS,
      activeCode: '3AA',
      revenueGrowthFwd: 0.10,
      structuralCyclicalityScore: 2,
      cyclePosition: 'elevated',
      grossMarginTtm: 0.55,
    });
    expect(r.maxThreshold).toBe(14);
    expect(r.comfortableThreshold).toBe(11);
    expect(r.veryGoodThreshold).toBe(8);
    expect(r.stealThreshold).toBe(5);
  });

  it('cyclicalOverlayValue = 2.0 (magnitude; thresholds tightened by 2; Case B elevated)', () => {
    const r = assignThresholdsRegimeDriven({
      regime: 'cyclical_earnings',
      thresholds: TEST_THRESHOLDS,
      activeCode: '3AA',
      revenueGrowthFwd: 0.10,
      structuralCyclicalityScore: 2,
      cyclePosition: 'elevated',
      grossMarginTtm: null,
    });
    expect(r.cyclicalOverlayApplied).toBe(true);
    expect(r.cyclicalOverlayValue).toBe(2);
  });
});

// ── Scenario E: JPM-like manual_required via bank_flag ───────────────────────

describe('Scenario E: JPM-like manual_required (bank_flag=true)', () => {
  it('selectRegime → manual_required (Step 0B short-circuits)', () => {
    expect(selectRegime(jpmRegimeInput())).toBe('manual_required');
  });

  it('all thresholds are null', () => {
    const r = assignThresholdsRegimeDriven({
      regime: 'manual_required',
      thresholds: TEST_THRESHOLDS,
      activeCode: '3AA',
      revenueGrowthFwd: 0.07,
      structuralCyclicalityScore: 0,
      cyclePosition: 'normal',
      grossMarginTtm: null,
    });
    expect(r.maxThreshold).toBeNull();
    expect(r.comfortableThreshold).toBeNull();
    expect(r.veryGoodThreshold).toBeNull();
    expect(r.stealThreshold).toBeNull();
  });

  it('valuationStateStatus = manual_required', () => {
    const r = assignThresholdsRegimeDriven({
      regime: 'manual_required',
      thresholds: TEST_THRESHOLDS,
      activeCode: '3AA',
      revenueGrowthFwd: null,
      structuralCyclicalityScore: 0,
      cyclePosition: 'normal',
      grossMarginTtm: null,
    });
    expect(r.valuationStateStatus).toBe('manual_required');
  });

  it('no threshold computation runs (thresholdSource = anchored, no adjustments)', () => {
    const r = assignThresholdsRegimeDriven({
      regime: 'manual_required',
      thresholds: TEST_THRESHOLDS,
      activeCode: '3AA',
      revenueGrowthFwd: null,
      structuralCyclicalityScore: 0,
      cyclePosition: 'normal',
      grossMarginTtm: null,
    });
    expect(r.thresholdAdjustments).toHaveLength(0);
  });
});
