// EPIC-004: Classification Engine & Universe Screen
// STORY-041: Bucket Scoring Algorithm
// TASK-041-001: Barrel exports for classification domain
// RFC-001 §ClassificationResult

export type {
  ClassificationInput,
  BucketNumber,
  GradeLevel,
  BucketScorerOutput,
  GradeScorerOutput,
} from './types';

export {
  REV_PRIMARY,
  REV_SECONDARY,
  EPS_PRIMARY,
  EPS_SECONDARY,
  PROFITABILITY,
  FCF_CONVERSION_WEIGHT,
  FLAG_PRIMARY,
  ENRICHMENT_BONUS,
  EQ_FCF_STRONG,
  EQ_FCF_MODERATE,
  EQ_FCF_WEAK,
  EQ_MOAT_STRONG,
  EQ_MOAT_MODERATE,
  EQ_MOAT_WEAK,
  EQ_NI_POSITIVE,
  BS_DEBT_LOW,
  BS_DEBT_MODERATE,
  BS_DEBT_HIGH,
  BS_COVERAGE_STRONG,
  BS_COVERAGE_MODERATE,
  BS_COVERAGE_WEAK,
  BS_CAPITAL_INTENSITY,
  BS_NET_CASH_BONUS,
} from './scoring-weights';

export {
  CRITICAL_FIELDS,
  NULL_SUGGESTION_THRESHOLD,
} from './confidence-thresholds';

export { BucketScorer } from './bucket-scorer';
export { EarningsQualityScorer } from './eq-scorer';
export { BalanceSheetQualityScorer } from './bs-scorer';
