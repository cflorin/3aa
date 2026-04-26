// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-007: computeValuation() — orchestrator chaining all domain components
// STORY-082: Confidence-based effective bucket demotion (RFC-003 §Confidence-Based Effective Bucket)

import type { ValuationInput, ValuationResult, ValuationStateStatus, PrimaryMetric } from './types';
import { selectMetric, parseBucket } from './metric-selector';
import { assignThresholds } from './threshold-assigner';
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

  if (multipleStatus === 'manual_required' || multipleStatus === 'missing_data') {
    return buildStatusResult(input, effectiveCode, primaryMetric, metricReason, multipleStatus);
  }

  // ── Stage 3: Threshold assignment (uses effectiveCode) ────────────────────
  const preOpLev = input.preOperatingLeverageFlag === true;
  const thresholdResult = assignThresholds(effectiveCode, input.anchoredThresholds, preOpLev);

  // ── Stage 4: TSR hurdle (uses effectiveCode) ───────────────────────────────
  const hurdle = calculateTsrHurdle(effectiveCode, input.tsrHurdles);

  // ── Stage 5: Secondary adjustments (uses effectiveCode) ───────────────────
  const adjResult = applySecondaryAdjustments({
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

  // ── Stage 6: Zone assignment ───────────────────────────────────────────────
  const valuationZone = assignZone(
    currentMultiple,
    adjResult.maxThreshold,
    adjResult.comfortableThreshold,
    adjResult.veryGoodThreshold,
    adjResult.stealThreshold,
  );

  const valuationStateStatus: ValuationStateStatus =
    valuationZone === 'not_applicable' ? 'missing_data' : 'ready';

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
  status: 'ok' | 'manual_required' | 'missing_data';
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
      return { currentMultiple: null, currentMultipleBasis: 'spot', metricSource: 'unknown', status: 'missing_data' };
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
