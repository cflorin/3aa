# STORY-076 — Valuation State Persistence & History

## Epic
EPIC-005 — Valuation Threshold Engine & Enhanced Universe

## Purpose
Implement the persistence layer that reads stock data from the DB, calls `computeValuation()` (STORY-075), writes the result to `valuation_state`, and appends a `valuation_history` row when the zone or key metrics change. This is the I/O companion to the pure domain layer.

## Story
As the system,
I want a `persistValuationState(ticker)` function that orchestrates loading, computing, diffing, and saving valuation results,
so that every stock's valuation zone is always current and every meaningful transition is recorded for audit.

## Outcome
A `src/modules/valuation/valuation-persistence.service.ts` module exists with:
- `persistValuationState(ticker, opts?)` — system batch path: loads stock data + thresholds, resolves `active_code = suggested_code`, calls `computeValuation()`, diffs, upserts `valuation_state`, appends `valuation_history` row on zone/TSR change.
- `getPersonalizedValuation(ticker, userId)` — user-facing read path: fetches system `valuation_state`, checks for `UserClassificationOverride` (uses `final_code` if present, else `suggested_code`), checks for `UserValuationOverride` (applies threshold/metric overrides), recomputes `computeValuation()` in-memory if any override exists, returns the merged result WITHOUT writing to `valuation_state`.
- `getValuationState(ticker)` — raw system state: returns current `ValuationState` row or null.
- `getValuationHistory(ticker, limit?)` — returns ordered `ValuationHistory` rows.
- `loadValuationInput(ticker, activeCode)` — assembles `ValuationInput` from `stock`, `anchored_thresholds`, and `tsr_hurdles` tables with the supplied `active_code`; returns null if stock missing.

## Scope In

### System batch path (`persistValuationState`)
- `loadValuationInput(ticker, activeCode)`: queries `stock` for all fundamental fields; queries `anchored_thresholds` for all rows; queries `tsr_hurdles` for all rows; maps to `ValuationInput` with supplied `activeCode`
- `persistValuationState(ticker, opts?)`: resolves `activeCode = stock.classificationState.suggestedCode`; calls `loadValuationInput` → `computeValuation` → upserts `valuation_state` → appends history row if zone or TSR hurdle changed
- `shouldPersist()` guard: calls `shouldRecompute(currentInput, priorState)` — skip write if returns false AND prior state exists; `priorState` is the existing `ValuationState` row (or null for first-time compute)
- History row `change_reason` values: `recompute` | `code_changed` | `metric_changed`
- Optimistic version bump on upsert (increment `version` field)
- Structured logging on each persist (ticker, zone, source, duration)

### User-facing personalized path (`getPersonalizedValuation`)
- Fetches `UserClassificationOverride` for (userId, ticker): if present, `activeCode = finalCode`; else `activeCode = suggestedCode` from system ClassificationState
- Fetches `UserValuationOverride` for (userId, ticker): extracts threshold overrides, `primaryMetricOverride`, `forwardOperatingEarningsExExcessCash`
- If no override of either kind exists: returns system `valuation_state` row directly (no recompute)
- If any override exists: calls `loadValuationInput(ticker, activeCode)`, merges user override fields, calls `computeValuation()` in-memory, returns result — **does NOT write to `valuation_state`**
- `valuation_state` is a system-shared row; user overrides are never persisted into it

### Read models
- `getValuationState(ticker)`: simple Prisma findUnique on `valuation_state`
- `getValuationHistory(ticker, limit?)`: Prisma findMany ordered by changedAt DESC

## Scope Out
- Batch job execution — STORY-077
- User override application — STORY-078
- UI — STORY-079, STORY-080

## Dependencies
- STORY-075 (computeValuation, shouldRecompute, ValuationInput/ValuationResult interfaces)
- STORY-004 (valuation_state, valuation_history, anchored_thresholds, tsr_hurdles tables exist)
- STORY-005 (anchored_thresholds + tsr_hurdles seeded)
- RFC-003 §Persistence Layer; RFC-002 §valuation_state + valuation_history schemas

## Preconditions
- `valuation_state` Prisma model exists with all fields (confirmed in schema)
- `valuation_history` Prisma model exists with all fields (confirmed in schema)
- `anchored_thresholds` seeded with 18 rows
- `tsr_hurdles` seeded with 8 rows
- `computeValuation()` exists (STORY-075)

## Inputs
- `ticker`: string
- `opts?`: `{ force?: boolean }` — if `force=true`, bypass `shouldRecompute()` guard

## Outputs
- `PersistResult`: `{ ticker, status: 'updated' | 'skipped' | 'error', zone?: string, reason?: string }`

## Acceptance Criteria
- [ ] `loadValuationInput(ticker)` assembles `ValuationInput` with all required fields from the DB; returns null if stock row missing
- [ ] `persistValuationState(ticker)` upserts `valuation_state` with all `ValuationResult` fields mapped to Prisma column names
- [ ] `persistValuationState(ticker)` appends a `valuation_history` row only when `newValuationZone !== oldValuationZone` OR `newAdjustedTsrHurdle !== oldAdjustedTsrHurdle` OR no prior state existed
- [ ] `shouldRecompute()` guard: when prior state exists and `force=false` and `shouldRecompute()` returns false → returns `{ status: 'skipped' }`
- [ ] Version field incremented on every upsert
- [ ] `contextSnapshot` JSON in history row includes: `active_code`, `primary_metric`, `current_multiple`, `valuation_zone`, `gross_margin_adjustment_applied`, `dilution_adjustment_applied`, timestamp
- [ ] `getValuationHistory(ticker, 20)` returns rows ordered by `changedAt DESC`
- [ ] All Prisma writes wrapped in a single transaction (upsert + history insert atomic)
- [ ] `PersistResult.status = 'error'` returned (no throw) when `computeValuation()` returns status `missing_data` or `classification_required`; error logged

## Test Strategy Expectations
- Unit tests (all DB interactions mocked via injected Prisma client or jest mock):
  - `loadValuationInput`: missing stock → null; stock with all fields → correct ValuationInput shape
  - `persistValuationState`: zone unchanged + no force → skipped; zone changed → history row inserted; first-time persist → upserts and appends history; computeValuation returns missing_data → error result, no write
  - Version increment: prior version=3 → updated to 4
  - Transaction: if history insert fails → valuation_state write rolled back
- Integration tests (real test DB):
  - Full persist round-trip: load → compute → upsert → verify DB row matches ValuationResult
  - History accumulation: two successive persists with zone change → two history rows
  - Idempotency: same inputs twice → second persist skipped (shouldRecompute=false path)

## Regression / Invariant Risks
- `contextSnapshot` must never contain undefined — JSON.stringify will silently drop undefined fields; use explicit null mapping
- History insert must be in same transaction as upsert — partial writes corrupt audit trail

## Definition of Done
- [ ] `src/modules/valuation/valuation-persistence.service.ts` implemented
- [ ] Unit + integration tests passing
- [ ] `PersistResult` type exported from module index
- [ ] Traceability comments in all new files (`// EPIC-005: ... STORY-076: ...`)
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-005 — Valuation Threshold Engine & Enhanced Universe
- RFC: RFC-003 — Valuation & Threshold Engine Architecture §Persistence Layer
- RFC: RFC-002 — Database Schema §valuation_state, §valuation_history
- ADR: ADR-005 — Threshold Management (anchored + derived lookup pattern)
- ADR: ADR-007 — Multi-User Architecture (system-level valuation_state, not per-user)
