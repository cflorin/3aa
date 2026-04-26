# STORY-065 — Classification Trend Metrics Integration (`ClassificationTrendMetrics`, `toClassificationInput`, `shouldRecompute`)

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
ready

## Purpose
Wire the quarterly-derived data into the classification engine. Adds `ClassificationTrendMetrics` type (from RFC-001 Amendment 2026-04-25) to the classifier input model, extends `toClassificationInput()` to JOIN `stock_derived_metrics` when available, and extends `shouldRecompute()` with the `quarterly_data_updated` trigger type from ADR-016.

## Story
As the **classification engine**,
I want **`ClassificationInput` to optionally carry a `trend_metrics` field populated from `stock_derived_metrics`**,
so that **scorers can consume quarterly trend context without querying raw quarterly rows, and the recompute batch correctly detects when new earnings data warrants reclassification**.

## Outcome
- `ClassificationTrendMetrics` TypeScript interface defined in `src/modules/classification-engine/types/` (matching RFC-001 §ClassificationTrendMetrics and RFC-008 `StockDerivedMetrics` projection)
- `toClassificationInput(ticker)` (or equivalent data assembly function) extended to LEFT JOIN `stock_derived_metrics`; when row present, maps all `StockDerivedMetrics` fields to `ClassificationTrendMetrics`; when absent, `trend_metrics` omitted from input
- `shouldRecompute(current, previous, opts?)` extended with third trigger type `quarterly_data_updated`; receives pre-evaluated boolean from batch orchestrator (not a timestamp comparison inside the function)
- Batch orchestrator query: `WHERE stock_derived_metrics.derived_as_of > classification_state.classification_last_updated_at` — identifies tickers needing recompute due to new quarterly data; passes `quarterlyDataUpdated = true` to `shouldRecompute`
- `RecomputeTrigger` union type updated to include `'quarterly_data_updated'`
- `trend_metrics` absent → all scorer quarterly branches degrade gracefully (no crash, no fabricated values)
- No breaking changes to existing scorer or batch job behavior when `stock_derived_metrics` has no row

## Scope In
- `src/modules/classification-engine/types/classification-trend-metrics.ts` — new type file
- Extension of `ClassificationInput` type to include `trend_metrics?: ClassificationTrendMetrics`
- `toClassificationInput()` function updated to LEFT JOIN `stock_derived_metrics`
- `shouldRecompute()` signature updated; `RecomputeTrigger` union extended
- Batch orchestrator (`classificationBatchJob`) updated with quarterly data recompute query
- Unit tests: `trend_metrics` absent → no crash; `quarterly_data_updated` trigger fires correctly

## Scope Out
- Using `trend_metrics` in scorers — STORY-066, STORY-067, STORY-068, STORY-069
- Populating `stock_derived_metrics` — STORY-060–062
- UI changes — STORY-070, STORY-071

## Dependencies
- **Epic:** EPIC-004
- **RFCs:** RFC-001 Amendment 2026-04-25 (ClassificationTrendMetrics, toClassificationInput extension, shouldRecompute trigger)
- **ADRs:** ADR-016 §Derived Metrics Recompute Trigger, §shouldRecompute Extension
- **Upstream:** STORY-058 (`stock_derived_metrics` table), STORY-062 (populates trend fields), STORY-044 (classification state persistence), STORY-047 (batch job)

## Preconditions
- `stock_derived_metrics` table and Prisma model exist (STORY-058)
- Existing `ClassificationInput` type established (STORY-041–043)
- `shouldRecompute` function exists with `fundamental_change` and `flag_change` triggers

## Inputs
- `stock_derived_metrics` row for ticker (optional — may be absent for new stocks)
- `classification_state.classification_last_updated_at` for recompute comparison

## Outputs
- `ClassificationInput` with optional populated `trend_metrics`
- `RecomputeTrigger` union including `'quarterly_data_updated'`
- Batch recompute correctly expanded when quarterly data is newer than last classification

## Acceptance Criteria
- [ ] `ClassificationTrendMetrics` interface matches RFC-001 Amendment 2026-04-25 field list (all ~40 fields optional)
- [ ] `trend_metrics` populated when `stock_derived_metrics` row exists for ticker
- [ ] `trend_metrics` absent (field omitted) when no `stock_derived_metrics` row exists
- [ ] `shouldRecompute` returns `{ recompute: true, trigger: 'quarterly_data_updated' }` when pre-evaluated flag is true
- [ ] Batch orchestrator query correctly identifies tickers where `derived_as_of > classification_last_updated_at`
- [ ] Existing `fundamental_change` and `flag_change` trigger paths unaffected
- [ ] All existing classification tests continue to pass (no regression)
- [ ] Unit tests: trend_metrics absent → no scorer crash; quarterly_data_updated trigger; batch query logic

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 Amendment 2026-04-25 (ClassificationTrendMetrics, shouldRecompute extension)
- ADR: ADR-016 §shouldRecompute Extension, ADR-015 §Schema
