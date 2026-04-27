# STORY-094 — Valuation Pipeline Integration

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Wire all EPIC-008 domain services into the live valuation pipeline. After this story, the nightly batch runs: (1) `CyclicalScoreService.computeAndPersist()`, then (2) `runValuationBatch()` which now calls `selectRegime()` internally and writes regime + cyclical fields to `valuation_state`. Existing records are migrated to `valuation_state_status = 'computed'`.

## Story
As the system,
I want the valuation cron pipeline to compute and persist regime, growth tier, and cyclical overlay fields on every valuation batch run,
so that the regime-decoupled threshold computation is active for all in-universe stocks.

## Outcome
- `computeValuation()` uses `selectRegime()` + regime-driven `ThresholdAssigner`
- `loadValuationInput()` fetches all new fields from DB
- `persistValuationState()` writes all new regime/cyclical fields
- `shouldRecompute()` checks new triggers
- CyclicalScoreService runs before valuation batch in cron sequence
- Existing 'ready' status records updated to 'computed'

## Scope In

### `computeValuation()` orchestrator update
In `src/domain/valuation/compute-valuation.ts`:
1. Call `selectRegime(input)` → `valuationRegime`
2. Inject `valuationRegime` into `ThresholdAssigner` call
3. Pass `structuralCyclicalityScore` and `cyclePosition` from input to ThresholdAssigner
4. New output fields returned in `ValuationResult`

The existing `selectMetric()` call is superseded for regime-driven paths but retained as a fallback for backward compat.

### `loadValuationInput()` update
In `src/modules/valuation/valuation-persistence.service.ts`:

**Current state:** fetches only from `Stock`. For EPIC-008, a `StockDerivedMetrics` join is required.

**Required changes:**
- Add `include: { derivedMetrics: true }` to the Prisma `stock.findUnique()` call (or a separate `stockDerivedMetrics.findUnique()` call)
- Fetch from `Stock`: `bank_flag`, `structural_cyclicality_score`, `cycle_position`, `cyclical_confidence`, `revenue_growth_fwd`, `net_income_positive`, `fcf_positive`, `fcf_conversion`
- Fetch from `StockDerivedMetrics`: `net_income_ttm`, `free_cash_flow_ttm`, `operating_margin_ttm`, `gross_margin_ttm`
- Fetch from `valuation_regime_thresholds`: all 9 rows (replaces `anchored_thresholds` load)

**Field notes (confirmed against current schema):**
- `fcfConversionTtm`: use `stock.fcf_conversion` (already populated by fundamentals sync, stored as ratio 0–1). No inline derivation needed.
- `netIncomePositive` and `fcfPositive`: use the pre-computed boolean flags from `Stock` for performance; these are kept current by the fundamentals sync pipeline
- `operatingMarginTtm` and `grossMarginTtm`: from `StockDerivedMetrics` (not on `Stock`)
- `netIncomeTtm` and `freeCashFlowTtm`: from `StockDerivedMetrics`

### `persistValuationState()` update
In `src/modules/valuation/valuation.service.ts`:
- Write new `valuation_state` columns:
  - `valuation_regime`
  - `threshold_family`
  - `structural_cyclicality_score_snapshot`
  - `cycle_position_snapshot`
  - `cyclical_overlay_applied`
  - `cyclical_overlay_value`
  - `cyclical_confidence`
  - `growth_tier`
- Update `valuation_state_status` default from `'ready'` to `'computed'`

### `shouldRecompute()` update
In `src/domain/valuation/should-recompute.ts`:
- Add new trigger: `structuralCyclicalityScore` changed → `reasons.push('cyclicality_score_changed')`
- Add new trigger: `cyclePosition` changed → `reasons.push('cycle_position_changed')`
- Add new trigger: `operatingMarginTtm` changed materially (≥ 5%) → `reasons.push('operating_margin_ttm_changed')`
- Add new trigger: `valuationRegime` changed → `reasons.push('regime_changed')`

### CyclicalScoreService integration in cron pipeline
In `src/app/api/cron/valuation/route.ts` (or the valuation batch job):
- Step 1: `await cyclicalScoreService.computeAndPersist()` — refresh all cyclical scores
- Step 2: `await runValuationBatch()` — runs with updated scores in DB

The two steps share the same cron route; cyclical score recompute adds ~few seconds overhead for typical universe sizes.

### `valuation_state_status` backward-compat data migration
One-time SQL migration (applied in this story's Prisma migration or seed):
```sql
UPDATE valuation_state SET valuation_state_status = 'computed' WHERE valuation_state_status = 'ready';
```
This is a safe one-time update — 'ready' and 'computed' are semantically identical.

### `ValuationHistory` — no changes needed
History table records old and new zones; regime fields not yet tracked in history (EPIC-008 V1 scope boundary). History records show old/new zones but do not snapshot regime changes.

## Scope Out
- UI display — STORY-095
- Regression tests — STORY-096
- `ValuationHistory` regime tracking — post-V1

## Dependencies
- STORY-089 ✅ (schema with new columns)
- STORY-091 ✅ (`CyclicalScoreService.computeAndPersist()` implemented)
- STORY-092 ✅ (`selectRegime()` implemented)
- STORY-093 ✅ (regime-driven ThresholdAssigner implemented)

## Preconditions
- All EPIC-008 domain services implemented (STORY-091–093)
- `stock.structural_cyclicality_score` and `stock.cycle_position` columns exist (STORY-089)
- `valuation_regime_thresholds` seeded (STORY-089)

## Tasks

### TASK-094-001: Update `computeValuation()` orchestrator
- File: `src/domain/valuation/compute-valuation.ts`
- Call `selectRegime(input)` at the top
- Inject regime into `ThresholdAssigner`
- Return new fields in `ValuationResult`
- Traceability: `// EPIC-008/STORY-094/TASK-094-001`

### TASK-094-002: Update `loadValuationInput()`
- Add `StockDerivedMetrics` join to the existing `prisma.stock.findUnique()` call
- Fetch new fields from `stock`: `bankFlag`, `structuralCyclicalityScore`, `cyclePosition`, `cyclicalConfidence`, `revenueGrowthFwd`, `netIncomePositive`, `fcfPositive`, `fcfConversion`
- Fetch from `StockDerivedMetrics`: `netIncomeTtm`, `freeCashFlowTtm`, `operatingMarginTtm`, `grossMarginTtm`
- Replace `anchoredThresholds` load with `valuationRegimeThresholds` load (`prisma.valuationRegimeThreshold.findMany()`)
- Map all new fields into `ValuationInput` — use `fcfConversion` from `stock` for `fcfConversionTtm` (already a ratio)
- Map `netIncomePositive` and `fcfPositive` boolean flags directly (no re-derivation from TTM values needed)

### TASK-094-003: Update `persistValuationState()`
- Write all 8 new `valuation_state` fields
- Set `valuationStateStatus = 'computed'` (not 'ready')
- Handle `null` values for non-applicable/manual_required regimes gracefully

### TASK-094-004: Update `shouldRecompute()`
- File: `src/domain/valuation/should-recompute.ts`
- Add 4 new trigger conditions listed above
- Unit test: each new trigger causes `should_recompute = true`

### TASK-094-005: Wire `CyclicalScoreService` into cron
- Update valuation cron route: call `CyclicalScoreService.computeAndPersist()` before `runValuationBatch()`
- Log: "Cyclical scores refreshed: N processed, M errors"
- Cron timeout: verify combined run completes within Cloud Scheduler timeout

### TASK-094-006: `valuation_state_status` data migration
- Add to Prisma migration or seed script:
  `UPDATE valuation_state SET valuation_state_status = 'computed' WHERE valuation_state_status = 'ready'`
- Add backward-compat read guard in service layer: treat 'ready' as 'computed' for any records missed

### TASK-094-007: Integration tests
- Run valuation batch against test DB with a known stock set (NVDA-like, WMT-like, MU-like)
- Assert: `valuation_state.valuation_regime` populated; `threshold_family` populated; `growth_tier` correct
- Assert: NVDA-like stock with high growth → `profitable_growth_pe`, tier=high, cyclical overlay applied
- Assert: WMT-like stock → `mature_pe`, no cyclical overlay

## Acceptance Criteria
- [ ] `computeValuation()` calls `selectRegime()` and injects regime into ThresholdAssigner
- [ ] `loadValuationInput()` fetches all new fields; no missing required fields
- [ ] `persistValuationState()` writes `valuation_regime`, `threshold_family`, `growth_tier`, cyclical fields
- [ ] `shouldRecompute()` triggers on cyclicality_score change, cycle_position change, operating_margin change, regime change
- [ ] Cron pipeline: CyclicalScoreService runs before valuation batch
- [ ] After batch run, no `valuation_state` rows have `valuation_state_status = 'ready'`
- [ ] Integration test: NVDA-like stock has `valuation_regime = 'profitable_growth_pe'` in DB after run
- [ ] All EPIC-005 unit tests still pass (no regression from orchestrator changes)

## Test Strategy
- Unit tests: `shouldRecompute()` new trigger conditions (pure function, no DB)
- Integration tests: full batch run against test DB with representative stocks
- Regression: full EPIC-005 unit test suite must pass unchanged
