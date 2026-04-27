# STORY-091 — CyclicalScoreService: structural_cyclicality_score + cycle_position

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Replace the boolean `cyclicality_flag` (EPIC-003.1, STORY-036) with a two-dimensional cyclicality model per ADR-018:
1. `structural_cyclicality_score` (int 0–3) — degree of inherent structural cyclicality
2. `cycle_position` (enum) — where current earnings sit relative to historical normal

These two fields are consumed by RegimeSelectorService (STORY-092) and ThresholdAssigner (STORY-093). The cyclical score uses quantitative history as the primary input, with a bounded LLM modifier (±1). Cycle position is purely quantitative — no LLM input.

## Story
As the system,
I want `structural_cyclicality_score` and `cycle_position` computed for every in-universe stock with sufficient quarterly history,
so that the valuation regime selector and threshold engine can distinguish NVIDIA-like profitable cyclicals from commodity cyclicals, and can tighten thresholds appropriately when earnings are elevated or at peak.

## Outcome
`CyclicalScoreService` is a new service that reads `stock_quarterly_history` and `stock_derived_metrics`, computes both fields, and persists them to `stock.structural_cyclicality_score` and `stock.cycle_position`. It runs as a pre-step in the valuation batch pipeline (before `runValuationBatch`).

## Framework Invariant (Hard — Must Be Preserved)

> When evidence is thin, mixed, or noisy: default to `normal` or `insufficient_data`. Never infer `elevated` or `peak` unless the margin deviation is unambiguous and **both conditions** fire simultaneously. False tightening from an incorrect `elevated`/`peak` is materially worse than false normalisation from `normal`. When in doubt, assign `normal` or `insufficient_data`.

This invariant must be encoded as a comment in the implementation and verified by tests.

## Scope In

### `computeStructuralCyclicalityScore(history, llmScores?): number`

**Pure function. Input:**
- `history: QuarterlyHistoryRow[]` — up to 16 quarters of `stock_quarterly_history`
- `llmScores?: { marginDurabilityScore: number; pricingPowerScore: number }` — from `ClassificationEnrichmentScore` (E4, E2)

**Algorithm (ADR-018):**

```
revenue_volatility    = std_dev(quarterly_revenue) / mean(quarterly_revenue)
op_margin_volatility  = std_dev(quarterly_op_margin)
gross_margin_range    = max(gross_margin) - min(gross_margin)  [across quarters]

base_score = 0
if revenue_volatility > 0.25 OR op_margin_volatility > 0.12: base_score += 1
if op_margin_range > 0.20 (20 pp):                           base_score += 1
if gross_margin_range > 0.15 (15 pp):                        base_score += 1
base_score = min(base_score, 3)

if fewer than 8 quarters: return 0 (default; defer to classification flag if available)
```

**LLM modifier (bounded ±1):**
```
cyclical_quality_modifier = (marginDurabilityScore + pricingPowerScore) / 2

if cyclical_quality_modifier >= 4.0: score = max(0, score - 1)
if cyclical_quality_modifier <= 2.0: score = min(3, score + 1)
```

LLM modifier is skipped if confidence on either score is low (scores are null/unavailable).

### `computeCyclePosition(history, derivedMetrics): CyclePosition`

**Pure function. No LLM input.**

```
ttm_op_margin    = derivedMetrics.operatingMarginTtm
history_avg      = mean(operatingMarginTtm across last 12 available quarters)
history_high_rev = max(quarterly_revenue in history window)
current_rev_ttm  = derivedMetrics.revenueTtm

if quarters_available < 8:
    return 'insufficient_data'

elif ttm_op_margin > history_avg × 1.25 AND current_rev_ttm >= history_high_rev:
    return 'peak'

elif ttm_op_margin > history_avg × 1.15 AND revGrowthTrend above history midpoint:
    return 'elevated'

elif ttm_op_margin < history_avg × 0.85:
    return 'depressed'

else:
    return 'normal'
```

**Conservative defaults enforced:**
- `elevated` requires BOTH margin AND revenue conditions — not just margin
- Default branch returns `'normal'`, never `'elevated'` or `'peak'`
- Any null inputs → `'normal'` (not `'insufficient_data'`, unless history < 8)

### `cyclical_confidence` computation

```
if quarters_available < 8:          cyclical_confidence = 'insufficient_data'
elif quarters_available >= 12 AND signal_clear:  cyclical_confidence = 'high'
elif quarters_available >= 8:       cyclical_confidence = 'medium'
else:                               cyclical_confidence = 'low'
```

`signal_clear` = score is the same with or without LLM modifier (no conflicting signal).

`cyclical_confidence` is computed here in CyclicalScoreService and persisted to `stock.cyclical_confidence`. `loadValuationInput()` (STORY-094) reads it from `stock`, passes it in `ValuationInput`, and `ThresholdAssigner` (STORY-093) passes it through to `ValuationResult` → `valuation_state.cyclical_confidence`. The ThresholdAssigner does **not** recompute it.

### `CyclicalScoreService.computeAndPersist(tickers?: string[])`

Batch method. For each stock (or subset `tickers`):
1. Load `stock_quarterly_history` (up to 16Q)
2. Load `stock_derived_metrics` (for TTM fields)
3. Load `ClassificationEnrichmentScore` (for LLM modifier, if available)
4. Call `computeStructuralCyclicalityScore()` → score
5. Call `computeCyclePosition()` → position
6. Call `computeCyclicalConfidence()` → confidence
7. Persist all three to `stock`: `structural_cyclicality_score`, `cycle_position`, `cyclical_confidence`

Returns: `{ processed: number; errors: number; errorDetails: string[] }`

## Scope Out
- Regime selection — STORY-092
- Threshold overlay application — STORY-093
- Wiring into cron/batch pipeline — STORY-094
- `cyclicality_flag` (boolean) is preserved on `stock` table as backward-compat computed value

## Dependencies
- STORY-089 ✅ (stock.structural_cyclicality_score and stock.cycle_position columns exist)
- EPIC-003 quarterly history stories (STORY-057–064 — `stock_quarterly_history` table exists and populated)
- EPIC-003.1 ✅ (`ClassificationEnrichmentScore` model with marginDurabilityScore, pricingPowerScore)

## Preconditions
- `stock_quarterly_history` table exists with at least some populated rows
- `ClassificationEnrichmentScore` available for relevant stocks
- Service degrades gracefully when history is absent (returns score=0, position=insufficient_data)

## Tasks

### TASK-091-001: `computeStructuralCyclicalityScore()` pure function
- File: `src/domain/valuation/cyclical-score.ts`
- Implement quantitative scoring algorithm per ADR-018
- Handle < 8 quarters: return 0, skip LLM modifier
- Include hard constraint comments: max ±1, cannot override profitability gates

### TASK-091-002: LLM modifier integration
- In same file: `applyLlmCyclicalityModifier(baseScore, llmScores): number`
- Null/low-confidence LLM scores → skip modifier (return baseScore unchanged)
- Cap ±1 strictly; clamp to [0, 3]

### TASK-091-003: `computeCyclePosition()` pure function
- Same file: `src/domain/valuation/cyclical-score.ts`
- Implement strict threshold logic (1.25× peak, 1.15× elevated, 0.85× depressed)
- Hard comment: "Conservative bias — false tightening worse than false normalisation"
- Both conditions required for elevated/peak — test this explicitly
- Null inputs (missing derivedMetrics) → return 'normal' unless quarters < 8

### TASK-091-004: `computeCyclicalConfidence()` pure function + `CyclicalScoreService` class
- Add `computeCyclicalConfidence(quartersAvailable: number, scoreWithLlm: number, scoreWithoutLlm: number): CyclicalConfidence` pure function
- File: `src/services/cyclical-score.service.ts` (or `src/domain/valuation/cyclical-score.ts`)
- `computeAndPersist(tickers?: string[]): Promise<BatchResult>`
- Loads quarterly history + derived metrics + enrichment scores from DB
- Calls `computeStructuralCyclicalityScore()`, `computeCyclePosition()`, `computeCyclicalConfidence()`
- **Persists all three fields to `stock`**: `structural_cyclicality_score`, `cycle_position`, `cyclical_confidence`
- Logs: tickers processed, scores set, errors

### TASK-091-005: Unit tests — golden-set + conservative bias
- `computeStructuralCyclicalityScore()`:
  - Semiconductor mock history (high revenue volatility, high margin swing) → score 2 or 3
  - SaaS mock history (stable revenue, stable margins) → score 0
  - Energy mock history (extreme volatility) → score 3
  - < 8 quarters → score 0 regardless
  - LLM modifier at 4.5 (high quality) → score reduced by 1
  - LLM modifier at 1.5 (low quality) → score raised by 1
  - LLM modifier null → score unchanged
- `computeCyclePosition()`:
  - Both margin elevated (+20%) AND revenue at peak → 'peak'
  - Margin elevated (+18%) but revenue NOT at peak → 'elevated' only if revenue trend above midpoint, else 'normal'
  - Only margin above threshold, no revenue signal → 'normal' (conservative default)
  - Margin depressed (−20%) → 'depressed'
  - Normal margin → 'normal'
  - < 8 quarters → 'insufficient_data'
  - Null derivedMetrics → 'normal'

## Acceptance Criteria
- [ ] Score 0 for stable SaaS/utility mock history; score 2–3 for semiconductor mock history
- [ ] `elevated` requires BOTH margin AND revenue conditions; margin alone → `normal`
- [ ] `peak` requires BOTH conditions with 1.25× margin threshold
- [ ] `'normal'` is the default branch — no code path returns elevated/peak without both conditions
- [ ] < 8 quarters → score 0, position 'insufficient_data'
- [ ] LLM modifier strictly bounded ±1; null scores → no modifier applied
- [ ] `computeAndPersist()` updates `stock.structural_cyclicality_score` and `stock.cycle_position` in DB
- [ ] Batch method degrades gracefully: stocks with no history get score=0, position='insufficient_data'
- [ ] All unit tests pass

## Test Strategy
- Unit tests: pure functions only, no DB dependency
- Golden-set: 4 mock history profiles (stable, moderate, semiconductor-like, energy-like) × 5 cycle positions
- Conservative bias tests: verify that the `elevated` and `peak` paths cannot be reached with only one condition
- Integration test: `computeAndPersist(['MOCK_SEMI', 'MOCK_STABLE'])` against test DB; assert DB rows updated
