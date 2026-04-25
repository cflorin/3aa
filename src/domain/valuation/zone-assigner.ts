// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// TASK-075-006: ZoneAssigner — current_multiple + thresholds → valuation_zone
// Source: docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md §Stage 6

import type { ValuationZone } from './types';

export function assignZone(
  currentMultiple: number | null,
  maxThreshold: number | null,
  comfortableThreshold: number | null,
  veryGoodThreshold: number | null,
  stealThreshold: number | null,
): ValuationZone {
  // No thresholds or no multiple → not applicable
  if (
    currentMultiple === null ||
    maxThreshold === null ||
    comfortableThreshold === null ||
    veryGoodThreshold === null ||
    stealThreshold === null
  ) {
    return 'not_applicable';
  }

  // Zone assignment per spec §Stage 6 rule order
  if (currentMultiple <= stealThreshold)      return 'steal_zone';
  if (currentMultiple <= veryGoodThreshold)   return 'very_good_zone';
  if (currentMultiple <= comfortableThreshold) return 'comfortable_zone';
  if (currentMultiple <= maxThreshold)         return 'max_zone';
  return 'above_max';
}
