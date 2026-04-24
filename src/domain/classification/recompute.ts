// EPIC-004: Classification Engine & Universe Screen
// STORY-047: Classification Recompute Batch Job
// TASK-047-001: shouldRecompute — determines if a stock needs reclassification
// RFC-001 §shouldRecompute; ADR-013 (5% threshold per 2026-04-23 user decision)

import type { ClassificationInput } from './types';

const FLAG_FIELDS = [
  'holding_company_flag',
  'insurer_flag',
  'cyclicality_flag',
  'optionality_flag',
  'binary_flag',
  'pre_operating_leverage_flag',
] as const satisfies ReadonlyArray<keyof ClassificationInput>;

// 5% absolute delta threshold for numeric growth fields — per 2026-04-23 user decision
const NUMERIC_THRESHOLD = 0.05;
const NUMERIC_FIELDS = [
  'revenue_growth_fwd',
  'eps_growth_fwd',
] as const satisfies ReadonlyArray<keyof ClassificationInput>;

export function shouldRecompute(
  current: ClassificationInput,
  previous: ClassificationInput | null,
): boolean {
  if (previous === null) return true;

  for (const field of NUMERIC_FIELDS) {
    const curr = (current[field] as number | null) ?? 0;
    const prev = (previous[field] as number | null) ?? 0;
    if (Math.abs(curr - prev) > NUMERIC_THRESHOLD) return true;
  }

  for (const field of FLAG_FIELDS) {
    if (current[field] !== previous[field]) return true;
  }

  return false;
}
