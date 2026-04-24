// EPIC-004: Classification Engine & Universe Screen
// STORY-041: Bucket Scoring Algorithm
// TASK-041-001: confidence-thresholds.ts stub — CRITICAL_FIELDS and NULL_SUGGESTION_THRESHOLD
// ADR-014: Classification Confidence Threshold Boundaries §Implementation Notes
//
// NOTE: HIGH_MARGIN_THRESHOLD, MEDIUM_MARGIN_THRESHOLD, and 5-step confidence
// computation are added in STORY-043 (classifyStock assembly). Extend this file; do not recreate.

import type { ClassificationInput } from './types';

// Exactly 10 critical fields per ADR-014 §Critical Fields Definition.
// Used for missing_field_count computation: count of these that are null/undefined.
// Must not include flags or enrichment scores — only fundamental data fields.
export const CRITICAL_FIELDS = [
  'revenue_growth_fwd',
  'revenue_growth_3y',
  'eps_growth_fwd',
  'eps_growth_3y',
  'fcf_conversion',
  'fcf_positive',
  'net_income_positive',
  'operating_margin',
  'net_debt_to_ebitda',
  'interest_coverage',
] as const satisfies ReadonlyArray<keyof ClassificationInput>;

// When missing_field_count > NULL_SUGGESTION_THRESHOLD → suggested_code = null, confidence = 'low'
// ADR-014 §Null-Suggestion Threshold: "missing_field_count > 5"
export const NULL_SUGGESTION_THRESHOLD = 5;
