// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-007: shouldRecompute — change detection using current input vs persisted ValuationState

import type { ValuationInput } from './types';
import { parseBucket } from './metric-selector';

// Minimal interface: the fields from ValuationState we compare against
export interface PriorValuationState {
  activeCode: string;
  primaryMetric: string;
  currentMultiple: number | null;
  adjustedTsrHurdle: number | null;
}

const MULTIPLE_CHANGE_THRESHOLD = 0.05; // 5% relative change triggers recompute

export function shouldRecompute(
  input: ValuationInput,
  priorState: PriorValuationState | null,
): boolean {
  // First-time compute always runs
  if (priorState === null) return true;

  // Active code changed (classification updated)
  if (input.activeCode !== priorState.activeCode) return true;

  // Primary metric changed (e.g., pre_op_lev flag toggled)
  const bucket = parseBucket(input.activeCode);
  const expectedMetric = resolveExpectedMetric(input, bucket);
  if (expectedMetric !== priorState.primaryMetric) return true;

  // Current multiple changed ≥5% relative
  const currentMultiple = resolveMultiple(input, expectedMetric);
  if (currentMultiple !== null && priorState.currentMultiple !== null) {
    const relativeChange = Math.abs(currentMultiple - priorState.currentMultiple) / Math.abs(priorState.currentMultiple);
    if (relativeChange >= MULTIPLE_CHANGE_THRESHOLD) return true;
  } else if (currentMultiple !== priorState.currentMultiple) {
    // One is null and the other is not
    return true;
  }

  return false;
}

function resolveExpectedMetric(input: ValuationInput, bucket: number): string {
  if (input.primaryMetricOverride) return input.primaryMetricOverride;
  // STORY-082: mirrors deriveEffectiveCode — low confidence demotes bucket by 1 (floor 1, exempt bucket 8)
  const effectiveBucket = (input.confidenceLevel === 'low' && bucket !== 8 && bucket > 1)
    ? bucket - 1
    : bucket;
  if (effectiveBucket === 8) return 'no_stable_metric';
  if (effectiveBucket >= 1 && effectiveBucket <= 4) {
    if ((input.holdingCompanyFlag || input.insurerFlag) && effectiveBucket === 3 && input.activeCode === '3AA') {
      return 'forward_operating_earnings_ex_excess_cash';
    }
    return 'forward_pe';
  }
  if (effectiveBucket === 5) return input.preOperatingLeverageFlag ? 'ev_sales' : 'forward_ev_ebit';
  return 'ev_sales';
}

function resolveMultiple(input: ValuationInput, metric: string): number | null {
  switch (metric) {
    case 'forward_pe': return input.forwardPe ?? null;
    case 'forward_ev_ebit': return input.forwardEvEbit ?? null;
    case 'ev_sales': return input.evSales ?? null;
    case 'forward_operating_earnings_ex_excess_cash':
      return input.forwardOperatingEarningsExExcessCash ?? null;
    default: return null;
  }
}
