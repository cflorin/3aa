// EPIC-008: Valuation Regime Decoupling
// STORY-093: ThresholdAssigner Regime Decoupling
// TASK-093-007: Unit tests — threshold computation golden-set

import {
  assignThresholdsRegimeDriven,
  resolveGrowthTier,
  computeProfitableGrowthCyclicalOverlay,
  computeCyclicalEarningsOverlay,
} from '../../../../src/domain/valuation/threshold-assigner';
import type { RegimeDrivenThresholdInput } from '../../../../src/domain/valuation/threshold-assigner';
import type { ValuationRegimeThresholdRow } from '../../../../src/domain/valuation/types';

// ── Shared test fixtures ──────────────────────────────────────────────────────

const TEST_THRESHOLDS: ValuationRegimeThresholdRow[] = [
  { regime: 'mature_pe',                   primaryMetric: 'forward_pe',                                 maxThreshold: 22,   comfortableThreshold: 20,   veryGoodThreshold: 18,   stealThreshold: 16   },
  { regime: 'profitable_growth_pe',        primaryMetric: 'forward_pe',                                 maxThreshold: 36,   comfortableThreshold: 30,   veryGoodThreshold: 24,   stealThreshold: 18   },
  { regime: 'profitable_growth_ev_ebit',   primaryMetric: 'forward_ev_ebit',                            maxThreshold: 24,   comfortableThreshold: 20,   veryGoodThreshold: 16,   stealThreshold: 12   },
  { regime: 'cyclical_earnings',           primaryMetric: 'forward_ev_ebit',                            maxThreshold: 16,   comfortableThreshold: 13,   veryGoodThreshold: 10,   stealThreshold: 7    },
  { regime: 'sales_growth_standard',       primaryMetric: 'ev_sales',                                   maxThreshold: 12,   comfortableThreshold: 10,   veryGoodThreshold: 8,    stealThreshold: 6    },
  { regime: 'sales_growth_hyper',          primaryMetric: 'ev_sales',                                   maxThreshold: 18,   comfortableThreshold: 15,   veryGoodThreshold: 11,   stealThreshold: 8    },
  { regime: 'financial_special_case',      primaryMetric: 'forward_operating_earnings_ex_excess_cash',  maxThreshold: null, comfortableThreshold: null, veryGoodThreshold: null, stealThreshold: null },
  { regime: 'not_applicable',              primaryMetric: 'no_stable_metric',                           maxThreshold: null, comfortableThreshold: null, veryGoodThreshold: null, stealThreshold: null },
  { regime: 'manual_required',             primaryMetric: 'no_stable_metric',                           maxThreshold: null, comfortableThreshold: null, veryGoodThreshold: null, stealThreshold: null },
];

function input(overrides: Partial<RegimeDrivenThresholdInput>): RegimeDrivenThresholdInput {
  return {
    regime: 'mature_pe',
    thresholds: TEST_THRESHOLDS,
    activeCode: '3AA',
    revenueGrowthFwd: null,
    structuralCyclicalityScore: 0,
    cyclePosition: 'normal',
    grossMarginTtm: null,
    ...overrides,
  };
}

// ── resolveGrowthTier ─────────────────────────────────────────────────────────

describe('resolveGrowthTier', () => {
  test('≥35% → high', () => expect(resolveGrowthTier(0.35)).toBe('high'));
  test('70% → high', () => expect(resolveGrowthTier(0.70)).toBe('high'));
  test('34.9% → mid', () => expect(resolveGrowthTier(0.349)).toBe('mid'));
  test('25% → mid', () => expect(resolveGrowthTier(0.25)).toBe('mid'));
  test('24.9% → standard', () => expect(resolveGrowthTier(0.249)).toBe('standard'));
  test('20% → standard', () => expect(resolveGrowthTier(0.20)).toBe('standard'));
});

// ── Cyclical overlay helpers ──────────────────────────────────────────────────

describe('computeProfitableGrowthCyclicalOverlay (Case A)', () => {
  test('score=0 → 0', () => expect(computeProfitableGrowthCyclicalOverlay(0, 'normal')).toBe(0));
  test('score=3 → 0 (handled upstream)', () => expect(computeProfitableGrowthCyclicalOverlay(3, 'elevated')).toBe(0));
  test('score=1, normal → 2.0', () => expect(computeProfitableGrowthCyclicalOverlay(1, 'normal')).toBe(2.0));
  test('score=1, elevated → 4.0', () => expect(computeProfitableGrowthCyclicalOverlay(1, 'elevated')).toBe(4.0));
  test('score=1, peak → 4.0', () => expect(computeProfitableGrowthCyclicalOverlay(1, 'peak')).toBe(4.0));
  test('score=2, normal → 4.0', () => expect(computeProfitableGrowthCyclicalOverlay(2, 'normal')).toBe(4.0));
  test('score=2, elevated → 6.0', () => expect(computeProfitableGrowthCyclicalOverlay(2, 'elevated')).toBe(6.0));
  test('score=2, peak → 6.0', () => expect(computeProfitableGrowthCyclicalOverlay(2, 'peak')).toBe(6.0));
  test('score=1, depressed → 2.0 (no reduction for depressed)', () => expect(computeProfitableGrowthCyclicalOverlay(1, 'depressed')).toBe(2.0));
});

describe('computeCyclicalEarningsOverlay (Case B)', () => {
  test('normal → 0', () => expect(computeCyclicalEarningsOverlay('normal')).toBe(0));
  test('depressed → 0', () => expect(computeCyclicalEarningsOverlay('depressed')).toBe(0));
  test('insufficient_data → 0', () => expect(computeCyclicalEarningsOverlay('insufficient_data')).toBe(0));
  test('elevated → 2.0', () => expect(computeCyclicalEarningsOverlay('elevated')).toBe(2.0));
  test('peak → 3.5', () => expect(computeCyclicalEarningsOverlay('peak')).toBe(3.5));
});

// ── Non-applicable regimes ────────────────────────────────────────────────────

describe('non-applicable regimes', () => {
  test('not_applicable → null thresholds, valuationStateStatus=not_applicable', () => {
    const r = assignThresholdsRegimeDriven(input({ regime: 'not_applicable' }));
    expect(r.maxThreshold).toBeNull();
    expect(r.comfortableThreshold).toBeNull();
    expect(r.stealThreshold).toBeNull();
    expect(r.valuationStateStatus).toBe('not_applicable');
  });

  test('manual_required → null thresholds, valuationStateStatus=manual_required', () => {
    const r = assignThresholdsRegimeDriven(input({ regime: 'manual_required' }));
    expect(r.maxThreshold).toBeNull();
    expect(r.valuationStateStatus).toBe('manual_required');
  });

  test('financial_special_case → null thresholds, valuationStateStatus=manual_required', () => {
    const r = assignThresholdsRegimeDriven(input({ regime: 'financial_special_case' }));
    expect(r.maxThreshold).toBeNull();
    expect(r.valuationStateStatus).toBe('manual_required');
  });
});

// ── Golden-set: profitable_growth_pe ─────────────────────────────────────────

describe('profitable_growth_pe golden-set', () => {
  test('NVDA-normal: high tier, score=2, normal, A/A → max=32, comfortable=26, veryGood=20, steal=14', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'profitable_growth_pe',
      activeCode: '3AA',
      revenueGrowthFwd: 0.70,
      structuralCyclicalityScore: 2,
      cyclePosition: 'normal',
    }));
    expect(r.maxThreshold).toBe(32);
    expect(r.comfortableThreshold).toBe(26);
    expect(r.veryGoodThreshold).toBe(20);
    expect(r.stealThreshold).toBe(14);
    expect(r.growthTier).toBe('high');
    expect(r.cyclicalOverlayApplied).toBe(true);
    expect(r.cyclicalOverlayValue).toBe(4.0);
    expect(r.thresholdFamily).toBe('profitable_growth_pe_high_AA');
    expect(r.valuationStateStatus).toBe('computed');
  });

  test('NVDA-elevated: high tier, score=2, elevated, A/A → max=30, comfortable=24, veryGood=18, steal=12', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'profitable_growth_pe',
      activeCode: '3AA',
      revenueGrowthFwd: 0.70,
      structuralCyclicalityScore: 2,
      cyclePosition: 'elevated',
    }));
    expect(r.maxThreshold).toBe(30);
    expect(r.comfortableThreshold).toBe(24);
    expect(r.veryGoodThreshold).toBe(18);
    expect(r.stealThreshold).toBe(12);
    expect(r.cyclicalOverlayValue).toBe(6.0);
  });

  test('NVDA-A/B: high tier, score=2, normal, A/B → max=30, comfortable=24, veryGood=18, steal=12', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'profitable_growth_pe',
      activeCode: '3AB',
      revenueGrowthFwd: 0.70,
      structuralCyclicalityScore: 2,
      cyclePosition: 'normal',
    }));
    expect(r.maxThreshold).toBe(30);
    expect(r.stealThreshold).toBe(12);
    expect(r.thresholdFamily).toBe('profitable_growth_pe_high_AB');
  });

  test('mid tier, score=0, normal, A/A → max=30, steal=17', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'profitable_growth_pe',
      activeCode: '2AA',
      revenueGrowthFwd: 0.28,
      structuralCyclicalityScore: 0,
      cyclePosition: 'normal',
    }));
    expect(r.maxThreshold).toBe(30);
    expect(r.stealThreshold).toBe(17);
    expect(r.growthTier).toBe('mid');
    expect(r.cyclicalOverlayApplied).toBe(false);
    expect(r.thresholdFamily).toBe('profitable_growth_pe_mid_AA');
  });

  test('standard tier, score=0, normal, B/A → max=22, steal=12', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'profitable_growth_pe',
      activeCode: '2BA',
      revenueGrowthFwd: 0.22,
      structuralCyclicalityScore: 0,
      cyclePosition: 'normal',
    }));
    expect(r.maxThreshold).toBe(22);
    expect(r.stealThreshold).toBe(12);
    expect(r.growthTier).toBe('standard');
    expect(r.thresholdFamily).toBe('profitable_growth_pe_standard_BA');
  });
});

// ── Golden-set: cyclical_earnings ─────────────────────────────────────────────

describe('cyclical_earnings golden-set', () => {
  test('MU-normal: A/A, normal → max=16, comfortable=13, veryGood=10, steal=7', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'cyclical_earnings',
      activeCode: '3AA',
      cyclePosition: 'normal',
    }));
    expect(r.maxThreshold).toBe(16);
    expect(r.comfortableThreshold).toBe(13);
    expect(r.veryGoodThreshold).toBe(10);
    expect(r.stealThreshold).toBe(7);
    expect(r.cyclicalOverlayApplied).toBe(false);
    expect(r.thresholdFamily).toBe('cyclical_earnings_AA');
  });

  test('MU-elevated: A/A, elevated → max=14, comfortable=11, veryGood=8, steal=5', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'cyclical_earnings',
      activeCode: '3AA',
      cyclePosition: 'elevated',
    }));
    expect(r.maxThreshold).toBe(14);
    expect(r.comfortableThreshold).toBe(11);
    expect(r.veryGoodThreshold).toBe(8);
    expect(r.stealThreshold).toBe(5);
    expect(r.cyclicalOverlayApplied).toBe(true);
    expect(r.cyclicalOverlayValue).toBe(2.0);
  });

  test('cyclical_earnings + depressed → no overlay, basis warning in adjustments', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'cyclical_earnings',
      activeCode: '3AA',
      cyclePosition: 'depressed',
    }));
    expect(r.maxThreshold).toBe(16);  // no overlay subtracted
    expect(r.cyclicalOverlayApplied).toBe(false);
    expect(r.thresholdAdjustments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'cyclical_warning', reason: 'depressed_cycle_spot_earnings_basis_warning' }),
      ]),
    );
  });

  test('cyclical_earnings peak: A/A → max=12.5, steal=3.5', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'cyclical_earnings',
      activeCode: '3AA',
      cyclePosition: 'peak',
    }));
    expect(r.maxThreshold).toBe(12.5);
    expect(r.stealThreshold).toBe(3.5);
  });
});

// ── Golden-set: mature_pe ─────────────────────────────────────────────────────

describe('mature_pe golden-set', () => {
  test('WMT: A/A → max=22, comfortable=20, veryGood=18, steal=16', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'mature_pe',
      activeCode: '2AA',
      cyclePosition: 'normal',
    }));
    expect(r.maxThreshold).toBe(22);
    expect(r.comfortableThreshold).toBe(20);
    expect(r.veryGoodThreshold).toBe(18);
    expect(r.stealThreshold).toBe(16);
    expect(r.thresholdFamily).toBe('mature_pe_AA');
    expect(r.cyclicalOverlayApplied).toBe(false);
  });

  test('WMT-B/B: mature_pe, B/B → max=18.5, steal=12.5', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'mature_pe',
      activeCode: '2BB',
      cyclePosition: 'normal',
    }));
    expect(r.maxThreshold).toBe(18.5);
    expect(r.stealThreshold).toBe(12.5);
    expect(r.thresholdFamily).toBe('mature_pe_BB');
  });

  test('mature_pe, C/A → eq downgrade 4.5 (eqAb=2.5 + eqBc=2.0)', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'mature_pe',
      activeCode: '2CA',
    }));
    // base: 22, downgrade: eqAb=2.5 + eqBc=2.0 = 4.5 → max=17.5
    expect(r.maxThreshold).toBe(17.5);
    expect(r.stealThreshold).toBe(11.5);
  });
});

// ── Golden-set: sales_growth regimes ─────────────────────────────────────────

describe('sales_growth regimes', () => {
  test('sales_growth_standard, A/A → max=12, steal=6, metricFamily=ev_sales', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'sales_growth_standard',
      activeCode: '6AA',
    }));
    expect(r.maxThreshold).toBe(12);
    expect(r.stealThreshold).toBe(6);
    expect(r.metricFamily).toBe('ev_sales');
  });

  test('sales_growth_hyper, A/A → max=18, steal=8', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'sales_growth_hyper',
      activeCode: '6AA',
    }));
    expect(r.maxThreshold).toBe(18);
    expect(r.stealThreshold).toBe(8);
  });

  test('sales_growth_standard, B/A, B6 → eq downgrade 2.0, max=10, steal=4', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'sales_growth_standard',
      activeCode: '6BA',
    }));
    expect(r.maxThreshold).toBe(10);
    expect(r.stealThreshold).toBe(4);
  });

  test('sales_growth_standard, B6, high gross margin (>0.80) → +1.0 step 5a', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'sales_growth_standard',
      activeCode: '6AA',
      grossMarginTtm: 0.85,
    }));
    expect(r.maxThreshold).toBe(13);
    expect(r.stealThreshold).toBe(7);
    expect(r.thresholdAdjustments).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'gross_margin', delta: 1.0 })]),
    );
  });

  test('sales_growth_standard, B7, low gross margin (<0.60) → -1.5 step 5a', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'sales_growth_standard',
      activeCode: '7AA',
      grossMarginTtm: 0.50,
    }));
    expect(r.maxThreshold).toBe(10.5);
    expect(r.stealThreshold).toBe(4.5);
  });

  test('step 5a does not fire for B5 (only B6/B7)', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'sales_growth_standard',
      activeCode: '5AA',
      grossMarginTtm: 0.90,
    }));
    expect(r.maxThreshold).toBe(12);  // no gross margin adj
  });

  test('dilution adjustment fires for B6 (step 5b)', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'sales_growth_standard',
      activeCode: '6AA',
      shareCountGrowth3y: 0.08,
    }));
    expect(r.maxThreshold).toBe(11);
    expect(r.stealThreshold).toBe(5);
    expect(r.thresholdAdjustments).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'dilution', delta: -1.0 })]),
    );
  });

  test('dilution does not fire for B3 (not B5–B7)', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'profitable_growth_pe',
      activeCode: '3AA',
      revenueGrowthFwd: 0.70,
      shareCountGrowth3y: 0.08,
    }));
    // step 4: score=0 → no overlay; step 5b: B3 → no dilution
    expect(r.maxThreshold).toBe(36);  // no downgrade (A/A), no overlay, no dilution
  });
});

// ── Floor and ordering invariants ─────────────────────────────────────────────

describe('floor and ordering invariants', () => {
  test('floor enforced: thresholds cannot go below 1.0 for PE regimes', () => {
    // Extreme quality degradation on a low-steal regime
    const r = assignThresholdsRegimeDriven(input({
      regime: 'mature_pe',
      activeCode: '4CC',  // worst quality
      cyclePosition: 'normal',
    }));
    // C/C: eqAb=2.5 + eqBc=2.0 + bsAb=1.0 + bsBc=2.0 = 7.5 total downgrade
    // steal floor: Math.max(steal - 7.5, 1.0) → 16 - 7.5 = 8.5 ≥ 1.0 → fine
    expect(r.stealThreshold).toBeGreaterThanOrEqual(1.0);
    // Ordering: steal ≤ veryGood ≤ comfortable ≤ max
    expect(r.stealThreshold!).toBeLessThanOrEqual(r.veryGoodThreshold!);
    expect(r.veryGoodThreshold!).toBeLessThanOrEqual(r.comfortableThreshold!);
    expect(r.comfortableThreshold!).toBeLessThanOrEqual(r.maxThreshold!);
  });

  test('floor enforced: EV/sales thresholds cannot go below 0.5', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'sales_growth_standard',
      activeCode: '6CC',
      grossMarginTtm: 0.40,  // -1.5 step 5a
      shareCountGrowth3y: 0.10,  // -1.0 step 5b
    }));
    expect(r.stealThreshold).toBeGreaterThanOrEqual(0.5);
    expect(r.stealThreshold!).toBeLessThanOrEqual(r.veryGoodThreshold!);
    expect(r.veryGoodThreshold!).toBeLessThanOrEqual(r.comfortableThreshold!);
    expect(r.comfortableThreshold!).toBeLessThanOrEqual(r.maxThreshold!);
  });

  test('ordering maintained after large overlay', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'cyclical_earnings',
      activeCode: '3CC',  // worst quality
      cyclePosition: 'peak',
    }));
    // Always ordered
    expect(r.stealThreshold!).toBeLessThanOrEqual(r.veryGoodThreshold!);
    expect(r.veryGoodThreshold!).toBeLessThanOrEqual(r.comfortableThreshold!);
    expect(r.comfortableThreshold!).toBeLessThanOrEqual(r.maxThreshold!);
  });
});

// ── thresholdFamily label format ──────────────────────────────────────────────

describe('thresholdFamily label format', () => {
  test('profitable_growth_pe with tier includes tier in label', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'profitable_growth_pe',
      activeCode: '3BA',
      revenueGrowthFwd: 0.60,
    }));
    expect(r.thresholdFamily).toBe('profitable_growth_pe_high_BA');
  });

  test('cyclical_earnings label: regime_EQBS', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'cyclical_earnings',
      activeCode: '3CA',
    }));
    expect(r.thresholdFamily).toBe('cyclical_earnings_CA');
  });

  test('mature_pe label: regime_EQBS', () => {
    const r = assignThresholdsRegimeDriven(input({
      regime: 'mature_pe',
      activeCode: '2AB',
    }));
    expect(r.thresholdFamily).toBe('mature_pe_AB');
  });

  test('non-applicable regimes: thresholdFamily is null', () => {
    const r = assignThresholdsRegimeDriven(input({ regime: 'not_applicable' }));
    expect(r.thresholdFamily).toBeNull();
  });
});

// ── metricFamily by regime ────────────────────────────────────────────────────

describe('metricFamily by regime', () => {
  test('mature_pe → pe', () => {
    expect(assignThresholdsRegimeDriven(input({ regime: 'mature_pe', activeCode: '2AA' })).metricFamily).toBe('pe');
  });
  test('profitable_growth_pe → pe', () => {
    expect(assignThresholdsRegimeDriven(input({ regime: 'profitable_growth_pe', activeCode: '3AA', revenueGrowthFwd: 0.40 })).metricFamily).toBe('pe');
  });
  test('cyclical_earnings → ev_ebit', () => {
    expect(assignThresholdsRegimeDriven(input({ regime: 'cyclical_earnings', activeCode: '3AA' })).metricFamily).toBe('ev_ebit');
  });
  test('profitable_growth_ev_ebit → ev_ebit', () => {
    expect(assignThresholdsRegimeDriven(input({ regime: 'profitable_growth_ev_ebit', activeCode: '3AA' })).metricFamily).toBe('ev_ebit');
  });
  test('sales_growth_standard → ev_sales', () => {
    expect(assignThresholdsRegimeDriven(input({ regime: 'sales_growth_standard', activeCode: '6AA' })).metricFamily).toBe('ev_sales');
  });
});
