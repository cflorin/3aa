// EPIC-005: Valuation Threshold Engine & Enhanced Universe
// STORY-075: Valuation Engine Domain Layer
// Public API for the valuation domain — all pure functions, no I/O

export { computeValuation, deriveEffectiveCode } from './compute-valuation';
export { shouldRecompute } from './should-recompute';
export { selectMetric, parseBucket } from './metric-selector';
export { assignThresholds } from './threshold-assigner';
export { calculateTsrHurdle } from './tsr-hurdle-calculator';
export { applySecondaryAdjustments } from './secondary-adjustments';
export { assignZone } from './zone-assigner';

export type {
  ValuationInput,
  ValuationResult,
  ValuationZone,
  ValuationStateStatus,
  PrimaryMetric,
  ThresholdSource,
  MetricFamily,
  AnchoredThresholdRow,
  TsrHurdleRow,
  ThresholdAdjustment,
} from './types';

export type { PriorValuationState } from './should-recompute';
export type { MetricSelectionResult } from './metric-selector';
export type { ThresholdResult } from './threshold-assigner';
export type { TsrHurdleResult } from './tsr-hurdle-calculator';
export type { AdjustmentResult } from './secondary-adjustments';
