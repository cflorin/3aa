// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-007: computeValuation() — orchestrator chaining all domain components
// STORY-082: Confidence-based effective bucket demotion (RFC-003 §Confidence-Based Effective Bucket)
// EPIC-008/STORY-094/TASK-094-001: Wire selectRegime() + assignThresholdsRegimeDriven() into pipeline

import type { ValuationInput, ValuationResult, ValuationStateStatus, PrimaryMetric } from './types';
import { selectMetric, parseBucket } from './metric-selector';
import { assignThresholds, assignThresholdsRegimeDriven } from './threshold-assigner';
import { selectRegime } from './regime-selector';
import { calculateTsrHurdle } from './tsr-hurdle-calculator';
import { applySecondaryAdjustments } from './secondary-adjustments';
import { assignZone } from './zone-assigner';

// STORY-082: When confidence is 'low', use bucket-1 (floor 1) to avoid applying a growth-stage
// metric to a borderline classification. Bucket 8 is exempt (special non-valuable case).
export function deriveEffectiveCode(activeCode: string, confidenceLevel: string | null | undefined): string {
  if (confidenceLevel !== 'low') return activeCode;
  const bucket = parseBucket(activeCode);
  if (bucket === 8 || bucket <= 1) return activeCode;
  return `${bucket - 1}${activeCode.slice(1)}`;
}

export function computeValuation(input: ValuationInput): ValuationResult {
  const bucket = parseBucket(input.activeCode);
  const effectiveCode = deriveEffectiveCode(input.activeCode, input.confidenceLevel);

  // ── Stage 1: Metric selection (uses effectiveCode) ─────────────────────────
  const { primaryMetric, metricReason } = selectMetric({ ...input, activeCode: effectiveCode });

  // ── Bucket 8: short-circuit ────────────────────────────────────────────────
  if (bucket === 8 || primaryMetric === 'no_stable_metric') {
    const hurdle = calculateTsrHurdle(effectiveCode, input.tsrHurdles);
    return {
      activeCode: input.activeCode,
      effectiveCode,
      primaryMetric,
      metricReason,
      currentMultiple: null,
      currentMultipleBasis: 'spot',
      metricSource: 'no_stable_metric',
      maxThreshold: null,
      comfortableThreshold: null,
      veryGoodThreshold: null,
      stealThreshold: null,
      thresholdSource: 'anchored',
      derivedFromCode: null,
      thresholdAdjustments: [],
      baseTsrHurdleLabel: hurdle.baseTsrHurdleLabel,
      baseTsrHurdleDefault: hurdle.baseTsrHurdleDefault,
      adjustedTsrHurdle: hurdle.adjustedTsrHurdle,
      hurdleSource: hurdle.hurdleSource,
      tsrReasonCodes: hurdle.tsrReasonCodes,
      valuationZone: 'not_applicable',
      valuationStateStatus: 'not_applicable',
      grossMarginAdjustmentApplied: false,
      dilutionAdjustmentApplied: false,
      cyclicalityContextFlag: input.cyclicalityFlag === true,
    };
  }

  // ── Holding company / insurer with no manual input ─────────────────────────
  if (primaryMetric === 'forward_operating_earnings_ex_excess_cash') {
    if (
      input.forwardOperatingEarningsExExcessCash == null
    ) {
      return buildStatusResult(input, effectiveCode, primaryMetric, metricReason, 'manual_required');
    }
  }

  // ── Stage 2: Resolve current multiple ─────────────────────────────────────
  const { currentMultiple, currentMultipleBasis, metricSource, status: multipleStatus } =
    resolveCurrentMultiple(input, primaryMetric);

  if (multipleStatus === 'manual_required') {
    return buildStatusResult(input, effectiveCode, primaryMetric, metricReason, multipleStatus);
  }

  // ── Stage 3: Threshold assignment ─────────────────────────────────────────
  // EPIC-008/STORY-094: when regime inputs are present, use regime-driven path;
  // otherwise fall back to legacy code-keyed path (anchoredThresholds).
  const preOpLev = input.preOperatingLeverageFlag === true;

  let thresholdResult: import('./threshold-assigner').ThresholdResult;
  let valuationRegime = input.valuationRegime;

  if (
    input.valuationRegimeThresholds?.length &&
    input.bankFlag !== undefined &&
    input.structuralCyclicalityScore !== undefined &&
    input.cyclePosition !== undefined
  ) {
    // Regime-driven path: compute regime first, then thresholds
    if (!valuationRegime) {
      valuationRegime = selectRegime({
        activeCode: input.activeCode,
        bankFlag: input.bankFlag ?? false,
        insurerFlag: input.insurerFlag ?? false,
        holdingCompanyFlag: input.holdingCompanyFlag ?? false,
        preOperatingLeverageFlag: preOpLev,
        netIncomeTtm: input.netIncomeTtm ?? null,
        freeCashFlowTtm: input.freeCashFlowTtm ?? null,
        operatingMarginTtm: input.operatingMarginTtm ?? null,
        grossMarginTtm: input.grossMarginTtm ?? null,
        fcfConversionTtm: input.fcfConversionTtm ?? null,
        revenueGrowthFwd: input.revenueGrowthFwd ?? null,
        structuralCyclicalityScore: input.structuralCyclicalityScore ?? 0,
      });
    }
    thresholdResult = assignThresholdsRegimeDriven({
      regime: valuationRegime,
      thresholds: input.valuationRegimeThresholds,
      activeCode: effectiveCode,
      revenueGrowthFwd: input.revenueGrowthFwd ?? null,
      structuralCyclicalityScore: input.structuralCyclicalityScore ?? 0,
      cyclePosition: (input.cyclePosition ?? 'normal') as import('./types').CyclePosition,
      grossMarginTtm: input.grossMarginTtm ?? null,
      shareCountGrowth3y: input.shareCountGrowth3y ?? null,
      materialDilutionFlag: input.materialDilutionFlag,
    });
  } else {
    // Legacy path: code-keyed anchored thresholds
    thresholdResult = assignThresholds(effectiveCode, input.anchoredThresholds, preOpLev);
  }

  // ── Stage 4: TSR hurdle (uses effectiveCode) ───────────────────────────────
  const hurdle = calculateTsrHurdle(effectiveCode, input.tsrHurdles);

  // ── Stage 5: Secondary adjustments ────────────────────────────────────────
  // In regime-driven path, steps 5a/5b are already applied inside assignThresholdsRegimeDriven.
  // In legacy path, apply them here via applySecondaryAdjustments.
  let adjResult: {
    maxThreshold: number | null;
    comfortableThreshold: number | null;
    veryGoodThreshold: number | null;
    stealThreshold: number | null;
    thresholdAdjustments: import('./types').ThresholdAdjustment[];
    grossMarginAdjustmentApplied: boolean;
    dilutionAdjustmentApplied: boolean;
    cyclicalityContextFlag: boolean;
  };

  if (valuationRegime) {
    adjResult = {
      maxThreshold: thresholdResult.maxThreshold,
      comfortableThreshold: thresholdResult.comfortableThreshold,
      veryGoodThreshold: thresholdResult.veryGoodThreshold,
      stealThreshold: thresholdResult.stealThreshold,
      thresholdAdjustments: thresholdResult.thresholdAdjustments ?? [],
      grossMarginAdjustmentApplied: thresholdResult.thresholdAdjustments?.some(a => a.type === 'gross_margin') ?? false,
      dilutionAdjustmentApplied: thresholdResult.thresholdAdjustments?.some(a => a.type === 'dilution') ?? false,
      cyclicalityContextFlag: input.cyclicalityFlag === true,
    };
  } else {
    const secAdj = applySecondaryAdjustments({
      activeCode: effectiveCode,
      metricFamily: thresholdResult.metricFamily,
      primaryMetric,
      maxThreshold: thresholdResult.maxThreshold,
      comfortableThreshold: thresholdResult.comfortableThreshold,
      veryGoodThreshold: thresholdResult.veryGoodThreshold,
      stealThreshold: thresholdResult.stealThreshold,
      grossMargin: input.grossMargin,
      shareCountGrowth3y: input.shareCountGrowth3y,
      materialDilutionFlag: input.materialDilutionFlag,
      cyclicalityFlag: input.cyclicalityFlag,
    });
    adjResult = secAdj;
  }

  // ── Stage 6: Zone assignment ───────────────────────────────────────────────
  const valuationZone = assignZone(
    currentMultiple,
    adjResult.maxThreshold,
    adjResult.comfortableThreshold,
    adjResult.veryGoodThreshold,
    adjResult.stealThreshold,
  );

  // 'ready' → 'computed', 'missing_data' → 'manual_required' (EPIC-008/STORY-089)
  const valuationStateStatus: ValuationStateStatus =
    (thresholdResult.valuationStateStatus && thresholdResult.valuationStateStatus !== 'computed')
      ? thresholdResult.valuationStateStatus
      : valuationZone === 'not_applicable' ? 'manual_required' : 'computed';

  return {
    activeCode: input.activeCode,
    effectiveCode,
    primaryMetric,
    metricReason,
    currentMultiple,
    currentMultipleBasis,
    metricSource,
    maxThreshold: adjResult.maxThreshold,
    comfortableThreshold: adjResult.comfortableThreshold,
    veryGoodThreshold: adjResult.veryGoodThreshold,
    stealThreshold: adjResult.stealThreshold,
    thresholdSource: thresholdResult.thresholdSource,
    derivedFromCode: thresholdResult.derivedFromCode,
    thresholdAdjustments: adjResult.thresholdAdjustments,
    baseTsrHurdleLabel: hurdle.baseTsrHurdleLabel,
    baseTsrHurdleDefault: hurdle.baseTsrHurdleDefault,
    adjustedTsrHurdle: hurdle.adjustedTsrHurdle,
    hurdleSource: hurdle.hurdleSource,
    tsrReasonCodes: hurdle.tsrReasonCodes,
    valuationZone,
    valuationStateStatus,
    grossMarginAdjustmentApplied: adjResult.grossMarginAdjustmentApplied,
    dilutionAdjustmentApplied: adjResult.dilutionAdjustmentApplied,
    cyclicalityContextFlag: adjResult.cyclicalityContextFlag,
    // EPIC-008 optional output fields
    valuationRegime,
    growthTier: thresholdResult.growthTier ?? null,
    structuralCyclicalityScoreSnapshot: input.structuralCyclicalityScore ?? null,
    cyclePositionSnapshot: (input.cyclePosition as import('./types').CyclePosition) ?? null,
    cyclicalOverlayApplied: thresholdResult.cyclicalOverlayApplied ?? null,
    cyclicalOverlayValue: thresholdResult.cyclicalOverlayValue ?? null,
    cyclicalConfidence: (input.cyclicalConfidence as import('./types').ValuationResult['cyclicalConfidence']) ?? null,
    thresholdFamily: thresholdResult.thresholdFamily ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveCurrentMultiple(
  input: ValuationInput,
  primaryMetric: PrimaryMetric,
): {
  currentMultiple: number | null;
  currentMultipleBasis: string;
  metricSource: string;
  status: 'ok' | 'manual_required';
} {
  switch (primaryMetric) {
    case 'forward_pe': {
      if (input.forwardPe != null) {
        return { currentMultiple: input.forwardPe, currentMultipleBasis: 'spot', metricSource: 'forward_pe', status: 'ok' };
      }
      // Fallback to trailing P/E if not cyclical and trailing P/E is positive (implies positive EPS)
      if (
        !input.cyclicalityFlag &&
        input.trailingPe != null && input.trailingPe > 0
      ) {
        return {
          currentMultiple: input.trailingPe,
          currentMultipleBasis: 'trailing_fallback',
          metricSource: 'fallback_trailing_pe',
          status: 'ok',
        };
      }
      return { currentMultiple: null, currentMultipleBasis: 'spot', metricSource: 'forward_pe', status: 'manual_required' };
    }

    case 'forward_ev_ebit':
      if (input.forwardEvEbit != null) {
        return { currentMultiple: input.forwardEvEbit, currentMultipleBasis: 'spot', metricSource: 'forward_ev_ebit', status: 'ok' };
      }
      if (input.trailingEvEbit != null) {
        return { currentMultiple: input.trailingEvEbit, currentMultipleBasis: 'trailing_fallback', metricSource: 'fallback_trailing_ev_ebit', status: 'ok' };
      }
      return { currentMultiple: null, currentMultipleBasis: 'spot', metricSource: 'forward_ev_ebit', status: 'manual_required' };

    case 'ev_sales':
      if (input.evSales != null) {
        return { currentMultiple: input.evSales, currentMultipleBasis: 'spot', metricSource: 'ev_sales', status: 'ok' };
      }
      return { currentMultiple: null, currentMultipleBasis: 'spot', metricSource: 'ev_sales', status: 'manual_required' };

    case 'forward_operating_earnings_ex_excess_cash':
      if (input.forwardOperatingEarningsExExcessCash != null) {
        return {
          currentMultiple: input.forwardOperatingEarningsExExcessCash,
          currentMultipleBasis: 'manual',
          metricSource: 'forward_operating_earnings_ex_excess_cash',
          status: 'ok',
        };
      }
      return { currentMultiple: null, currentMultipleBasis: 'spot', metricSource: 'forward_operating_earnings_ex_excess_cash', status: 'manual_required' };

    default:
      return { currentMultiple: null, currentMultipleBasis: 'spot', metricSource: 'unknown', status: 'manual_required' };
  }
}

function buildStatusResult(
  input: ValuationInput,
  effectiveCode: string,
  primaryMetric: PrimaryMetric,
  metricReason: string,
  status: ValuationStateStatus,
): ValuationResult {
  const hurdle = calculateTsrHurdle(effectiveCode, input.tsrHurdles);
  const thresholdResult = assignThresholds(
    effectiveCode,
    input.anchoredThresholds,
    input.preOperatingLeverageFlag === true,
  );

  return {
    activeCode: input.activeCode,
    effectiveCode,
    primaryMetric,
    metricReason,
    currentMultiple: null,
    currentMultipleBasis: 'spot',
    metricSource: primaryMetric,
    maxThreshold: thresholdResult.maxThreshold,
    comfortableThreshold: thresholdResult.comfortableThreshold,
    veryGoodThreshold: thresholdResult.veryGoodThreshold,
    stealThreshold: thresholdResult.stealThreshold,
    thresholdSource: thresholdResult.thresholdSource,
    derivedFromCode: thresholdResult.derivedFromCode,
    thresholdAdjustments: [],
    baseTsrHurdleLabel: hurdle.baseTsrHurdleLabel,
    baseTsrHurdleDefault: hurdle.baseTsrHurdleDefault,
    adjustedTsrHurdle: hurdle.adjustedTsrHurdle,
    hurdleSource: hurdle.hurdleSource,
    tsrReasonCodes: hurdle.tsrReasonCodes,
    valuationZone: 'not_applicable',
    valuationStateStatus: status,
    grossMarginAdjustmentApplied: false,
    dilutionAdjustmentApplied: false,
    cyclicalityContextFlag: input.cyclicalityFlag === true,
  };
}
