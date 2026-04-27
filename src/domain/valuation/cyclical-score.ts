// EPIC-008: Valuation Regime Decoupling
// STORY-091: CyclicalScoreService — structural_cyclicality_score + cycle_position
// TASK-091-001: computeStructuralCyclicalityScore() pure function
// TASK-091-002: applyLlmCyclicalityModifier() — bounded ±1 LLM modifier
// TASK-091-003: computeCyclePosition() pure function (conservative bias invariant)
// TASK-091-004: computeCyclicalConfidence() pure function

import type { CyclePosition } from './types';

export type CyclicalConfidence = 'high' | 'medium' | 'low' | 'insufficient_data';

// Minimal row interface — only fields needed for scoring
export interface QuarterlyHistoryRow {
  revenue: number | null;
  operatingMargin: number | null;
  grossMargin: number | null;
}

export interface DerivedMetricsRow {
  operatingMarginTtm: number | null;
  revenueTtm: number | null;
  quartersAvailable: number;
}

export interface LlmScores {
  marginDurabilityScore: number | null;
  pricingPowerScore: number | null;
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ── TASK-091-001: computeStructuralCyclicalityScore ──────────────────────────

/**
 * Quantitative cyclicality scoring (ADR-018).
 * Returns 0 if fewer than 8 quarters available (insufficient history).
 * LLM modifier applied separately via applyLlmCyclicalityModifier().
 */
export function computeStructuralCyclicalityScore(history: QuarterlyHistoryRow[]): number {
  if (history.length < 8) return 0;

  const revenues = history.map((r) => r.revenue).filter((v): v is number => v !== null);
  const opMargins = history.map((r) => r.operatingMargin).filter((v): v is number => v !== null);
  const grossMargins = history.map((r) => r.grossMargin).filter((v): v is number => v !== null);

  const revMean = mean(revenues);
  const revenueVolatility = revMean !== 0 ? stdDev(revenues) / revMean : 0;
  const opMarginVolatility = stdDev(opMargins);
  const opMarginRange = opMargins.length >= 2
    ? Math.max(...opMargins) - Math.min(...opMargins)
    : 0;
  const grossMarginRange = grossMargins.length >= 2
    ? Math.max(...grossMargins) - Math.min(...grossMargins)
    : 0;

  let score = 0;
  if (revenueVolatility > 0.25 || opMarginVolatility > 0.12) score += 1;
  if (opMarginRange > 0.20) score += 1;
  if (grossMarginRange > 0.15) score += 1;

  return Math.min(score, 3);
}

// ── TASK-091-002: applyLlmCyclicalityModifier ────────────────────────────────

/**
 * Applies bounded ±1 LLM modifier to the base cyclicality score.
 * High combined quality (>=4.0) reduces score by 1; low quality (<=2.0) raises by 1.
 * Returns baseScore unchanged if llmScores are null (scores unavailable).
 */
export function applyLlmCyclicalityModifier(baseScore: number, llmScores: LlmScores | null): number {
  if (
    llmScores === null ||
    llmScores.marginDurabilityScore === null ||
    llmScores.pricingPowerScore === null
  ) {
    return baseScore;
  }

  const combined = (llmScores.marginDurabilityScore + llmScores.pricingPowerScore) / 2;

  if (combined >= 4.0) return Math.max(0, baseScore - 1);
  if (combined <= 2.0) return Math.min(3, baseScore + 1);
  return baseScore;
}

// ── TASK-091-003: computeCyclePosition ───────────────────────────────────────

/**
 * Quantitative cycle position from quarterly history and TTM derived metrics.
 * NO LLM input — purely quantitative.
 *
 * FRAMEWORK INVARIANT (ADR-018, hard — must be preserved):
 * Conservative bias: false tightening (incorrect elevated/peak) is materially worse
 * than false normalisation. `elevated` and `peak` require BOTH margin AND revenue
 * conditions to fire simultaneously. When in doubt, return 'normal'.
 */
export function computeCyclePosition(
  history: QuarterlyHistoryRow[],
  derivedMetrics: DerivedMetricsRow | null,
): CyclePosition {
  if (history.length < 8) return 'insufficient_data';

  // Null derivedMetrics → cannot compute; conservative default is 'normal' (ADR-018)
  if (derivedMetrics === null) return 'normal';

  const ttmOpMargin = derivedMetrics.operatingMarginTtm;
  const currentRevTtm = derivedMetrics.revenueTtm;

  // Null TTM values → conservative default 'normal', not 'insufficient_data'
  if (ttmOpMargin === null) return 'normal';

  const historyOpMargins = history
    .map((r) => r.operatingMargin)
    .filter((v): v is number => v !== null);

  if (historyOpMargins.length < 4) return 'normal';

  const historyAvg = mean(historyOpMargins);

  // Need a positive history average to compute ratios meaningfully
  if (historyAvg <= 0) return 'normal';

  const historyRevenues = history.map((r) => r.revenue).filter((v): v is number => v !== null);
  const historyHighRev = historyRevenues.length > 0 ? Math.max(...historyRevenues) : null;

  // ── CONSERVATIVE BIAS: both conditions required for peak/elevated ──────────
  // Peak: margin ≥ 1.25× avg AND current TTM revenue ≥ historical high
  if (
    ttmOpMargin >= historyAvg * 1.25 &&
    currentRevTtm !== null &&
    historyHighRev !== null &&
    currentRevTtm >= historyHighRev
  ) {
    return 'peak';
  }

  // Elevated: margin ≥ 1.15× avg AND revenue trend above history midpoint
  const historyRevMidpoint = historyRevenues.length > 0 ? mean(historyRevenues) : null;
  if (
    ttmOpMargin >= historyAvg * 1.15 &&
    currentRevTtm !== null &&
    historyRevMidpoint !== null &&
    currentRevTtm > historyRevMidpoint
  ) {
    return 'elevated';
  }

  // Depressed: margin < 0.85× avg
  if (ttmOpMargin < historyAvg * 0.85) return 'depressed';

  // Conservative default — never infer elevated/peak from margin alone
  return 'normal';
}

// ── TASK-091-004: computeCyclicalConfidence ──────────────────────────────────

/**
 * Confidence level for cyclical scoring results.
 * `signal_clear` = score is identical with or without LLM modifier (no LLM conflict).
 */
export function computeCyclicalConfidence(
  quartersAvailable: number,
  scoreWithLlm: number,
  scoreWithoutLlm: number,
): CyclicalConfidence {
  if (quartersAvailable < 8) return 'insufficient_data';

  const signalClear = scoreWithLlm === scoreWithoutLlm;
  if (quartersAvailable >= 12 && signalClear) return 'high';
  if (quartersAvailable >= 8) return 'medium';
  return 'low';
}
