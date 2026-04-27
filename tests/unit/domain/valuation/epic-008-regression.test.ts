// EPIC-008: Valuation Regime Decoupling
// STORY-096: EPIC-008 Regression & Integration Tests
// TASK-096-003: Regression tests — EPIC-005 baseline preservation
//
// Invariant: for stock with structural_cyclicality_score=0 and no special flags,
// EPIC-008 thresholds must equal EPIC-005 anchor values for the corresponding regime.
// Score=0 means no cyclical overlay. A/A quality means no downgrade.

import { selectRegime } from '../../../../src/domain/valuation/regime-selector';
import { assignThresholdsRegimeDriven } from '../../../../src/domain/valuation/threshold-assigner';
import type { RegimeSelectorInput, ValuationRegimeThresholdRow } from '../../../../src/domain/valuation/types';
import type { RegimeDrivenThresholdInput } from '../../../../src/domain/valuation/threshold-assigner';

// Matches seed data (same values as EPIC-005 anchors for corresponding regimes)
const REGIME_THRESHOLDS: ValuationRegimeThresholdRow[] = [
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

function runPipeline(regimeInput: RegimeSelectorInput, activeCode: string, cyclePosition: RegimeDrivenThresholdInput['cyclePosition'] = 'normal') {
  const regime = selectRegime(regimeInput);
  const thresholds = assignThresholdsRegimeDriven({
    regime,
    thresholds: REGIME_THRESHOLDS,
    activeCode,
    revenueGrowthFwd: regimeInput.revenueGrowthFwd,
    structuralCyclicalityScore: regimeInput.structuralCyclicalityScore,
    cyclePosition,
    grossMarginTtm: regimeInput.grossMarginTtm,
  });
  return { regime, thresholds };
}

// ── WMT-like stable mature stock ─────────────────────────────────────────────

describe('EPIC-005 baseline preservation: WMT-like mature_pe, score=0, A/A', () => {
  const wmtInput: RegimeSelectorInput = {
    activeCode: '2AA',
    bankFlag: false, insurerFlag: false, holdingCompanyFlag: false, preOperatingLeverageFlag: false,
    netIncomeTtm: 5_000_000_000,
    freeCashFlowTtm: 4_000_000_000,
    operatingMarginTtm: 0.0447,
    grossMarginTtm: 0.25,
    fcfConversionTtm: 0.70,
    revenueGrowthFwd: 0.05,
    structuralCyclicalityScore: 0,
  };

  it('regime = mature_pe', () => {
    expect(runPipeline(wmtInput, '2AA').regime).toBe('mature_pe');
  });

  it('thresholds unchanged from EPIC-005 anchor: 22/20/18/16', () => {
    const { thresholds } = runPipeline(wmtInput, '2AA');
    expect(thresholds.maxThreshold).toBe(22);
    expect(thresholds.comfortableThreshold).toBe(20);
    expect(thresholds.veryGoodThreshold).toBe(18);
    expect(thresholds.stealThreshold).toBe(16);
  });

  it('no cyclical overlay (score=0)', () => {
    const { thresholds } = runPipeline(wmtInput, '2AA');
    expect(thresholds.cyclicalOverlayApplied).toBe(false);
    expect(thresholds.cyclicalOverlayValue).toBeNull();
  });

  it('status = computed', () => {
    expect(runPipeline(wmtInput, '2AA').thresholds.valuationStateStatus).toBe('computed');
  });
});

// ── MSFT-like profitable growth stock ────────────────────────────────────────

describe('EPIC-005 baseline preservation: MSFT-like profitable_growth_pe, score=0, A/A, standard tier', () => {
  const msftInput: RegimeSelectorInput = {
    activeCode: '3AA',
    bankFlag: false, insurerFlag: false, holdingCompanyFlag: false, preOperatingLeverageFlag: false,
    netIncomeTtm: 70_000_000_000,
    freeCashFlowTtm: 60_000_000_000,
    operatingMarginTtm: 0.45,
    grossMarginTtm: 0.70,
    fcfConversionTtm: 0.85,
    revenueGrowthFwd: 0.14,  // < 25% → standard tier (but ≥ 10% → Step 2 partially fails)
    structuralCyclicalityScore: 0,
  };

  // Note: rev_growth=0.14 < 0.20 → Step 2 doesn't fire. Score=0 → Step 3 doesn't fire.
  // Step 4 requires rev_growth ≥ 0.15, 0.14 < 0.15 → Step 4 doesn't fire.
  // Step 5: net income + FCF positive → mature_pe
  it('regime = mature_pe (rev_growth <15% means Step 4 misses; Step 5 fires)', () => {
    expect(runPipeline(msftInput, '3AA').regime).toBe('mature_pe');
  });

  it('thresholds = 22/20/18/16 (mature_pe anchor, no overlay)', () => {
    const { thresholds } = runPipeline(msftInput, '3AA');
    expect(thresholds.maxThreshold).toBe(22);
    expect(thresholds.stealThreshold).toBe(16);
    expect(thresholds.cyclicalOverlayApplied).toBe(false);
  });
});

// ── MSFT-like with higher growth → profitable_growth_pe ─────────────────────

describe('EPIC-005 baseline preservation: MSFT-high-growth, profitable_growth_pe, score=0, standard tier', () => {
  const msftHighGrowth: RegimeSelectorInput = {
    activeCode: '4AA',
    bankFlag: false, insurerFlag: false, holdingCompanyFlag: false, preOperatingLeverageFlag: false,
    netIncomeTtm: 70_000_000_000,
    freeCashFlowTtm: 60_000_000_000,
    operatingMarginTtm: 0.45,
    grossMarginTtm: 0.70,
    fcfConversionTtm: 0.85,
    revenueGrowthFwd: 0.22,   // ≥ 0.20 → Step 2 fires; 22% < 25% → standard tier
    structuralCyclicalityScore: 0,
  };

  it('regime = profitable_growth_pe (score=0, no score-3 override)', () => {
    expect(runPipeline(msftHighGrowth, '4AA').regime).toBe('profitable_growth_pe');
  });

  it('growth tier = standard (22% < 25%)', () => {
    const { thresholds } = runPipeline(msftHighGrowth, '4AA');
    expect(thresholds.growthTier).toBe('standard');
  });

  it('no cyclical overlay for score=0', () => {
    const { thresholds } = runPipeline(msftHighGrowth, '4AA');
    expect(thresholds.cyclicalOverlayApplied).toBe(false);
    expect(thresholds.cyclicalOverlayValue).toBeNull();
  });

  it('thresholds = standard tier base values (26/22/19/16 — standard tier from GROWTH_TIER_CONFIG)', () => {
    const { thresholds } = runPipeline(msftHighGrowth, '4AA');
    // Standard tier: {26, 22, 19, 16}
    expect(thresholds.maxThreshold).toBe(26);
    expect(thresholds.comfortableThreshold).toBe(22);
    expect(thresholds.veryGoodThreshold).toBe(19);
    expect(thresholds.stealThreshold).toBe(16);
  });
});

// ── Invariant: score=0 never applies cyclical overlay regardless of position ─

describe('Regression invariant: score=0 never applies cyclical overlay', () => {
  const positions = ['normal', 'elevated', 'peak', 'depressed'] as const;

  for (const pos of positions) {
    it(`mature_pe, score=0, position=${pos} → cyclicalOverlayApplied=false`, () => {
      const { thresholds } = runPipeline({
        activeCode: '2AA',
        bankFlag: false, insurerFlag: false, holdingCompanyFlag: false, preOperatingLeverageFlag: false,
        netIncomeTtm: 1, freeCashFlowTtm: 1,
        operatingMarginTtm: 0.10, grossMarginTtm: 0.30, fcfConversionTtm: 0.70,
        revenueGrowthFwd: 0.05, structuralCyclicalityScore: 0,
      }, '2AA', pos);
      expect(thresholds.cyclicalOverlayApplied).toBe(false);
    });
  }

  for (const pos of positions) {
    it(`profitable_growth_pe, score=0, position=${pos} → cyclicalOverlayApplied=false`, () => {
      const { thresholds } = runPipeline({
        activeCode: '4AA',
        bankFlag: false, insurerFlag: false, holdingCompanyFlag: false, preOperatingLeverageFlag: false,
        netIncomeTtm: 1, freeCashFlowTtm: 1,
        operatingMarginTtm: 0.30, grossMarginTtm: 0.70, fcfConversionTtm: 0.80,
        revenueGrowthFwd: 0.25, structuralCyclicalityScore: 0,
      }, '4AA', pos);
      expect(thresholds.cyclicalOverlayApplied).toBe(false);
    });
  }
});
