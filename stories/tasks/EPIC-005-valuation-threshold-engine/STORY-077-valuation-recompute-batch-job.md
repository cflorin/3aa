# STORY-077 — Valuation Recompute Batch Job

## Epic
EPIC-005 — Valuation Threshold Engine & Enhanced Universe

## Purpose
Implement the nightly batch job that calls `persistValuationState()` for every in-universe stock, activates the existing `/api/cron/valuation` placeholder, and wires to the Cloud Scheduler job already registered in STORY-003/STORY-007.

## Story
As the system,
I want a nightly cron job that recomputes valuation state for all in-universe stocks,
so that valuation zones are refreshed daily as prices and fundamentals change.

## Outcome
A `runValuationBatch()` service function exists in `src/modules/valuation/valuation-batch.service.ts`. The existing `src/app/api/cron/valuation/route.ts` placeholder is replaced with a real implementation that calls this service. The job processes all in-universe stocks, logs results, and returns a structured summary.

## Scope In
- `runValuationBatch(opts?)`: fetches all in-universe tickers; calls `persistValuationState(ticker, { force })` for each; accumulates `{ updated, skipped, errors, total }` summary; logs per-ticker result as structured JSON
- `opts`: `{ force?: boolean, tickerFilter?: string }` — `force` bypasses `shouldRecompute()` guard; `tickerFilter` restricts to single ticker (for add-stock pipeline)
- `/api/cron/valuation` POST route: OIDC-verified; parses `?force=true` query param; calls `runValuationBatch()`; returns summary JSON
- Batch processes stocks sequentially (no concurrent DB storms)
- Error in one ticker does not abort batch — logged and counted
- Duration logged at batch complete
- **Add-stock pipeline update**: `src/app/api/universe/stocks/route.ts` gains a Stage 11 (valuation) after Stage 10 (classification); `TOTAL_STAGES` updated from 10 → 11 in both route and `AddStockModal.tsx`

## Scope Out
- Domain logic — STORY-075
- Persistence layer — STORY-076
- User override — STORY-078
- UI — STORY-079, STORY-080

## Dependencies
- STORY-076 (`persistValuationState`, `PersistResult`)
- STORY-003/STORY-007 (Cloud Scheduler job for `/api/cron/valuation` already registered at 8:15 PM ET after classification batch)
- ADR-002 (pipeline execution order: classification → valuation)

## Preconditions
- `/api/cron/valuation/route.ts` exists as placeholder (confirmed)
- `persistValuationState()` exists (STORY-076)
- Cloud Scheduler job registered (STORY-007)

## Inputs (cron trigger)
- HTTP POST to `/api/cron/valuation`
- Optional query: `?force=true`, `?ticker=AAPL`
- OIDC bearer token from Cloud Scheduler

## Outputs
```json
{
  "total": 150,
  "updated": 120,
  "skipped": 25,
  "errors": 5,
  "duration_ms": 8420
}
```

## Acceptance Criteria
- [ ] `runValuationBatch()` processes all `inUniverse=true` stocks
- [ ] `tickerFilter` restricts processing to that one ticker (used by add-stock pipeline)
- [ ] `force=true` bypasses shouldRecompute guard for all stocks
- [ ] One ticker error does not stop batch — error counted, ticker logged, batch continues
- [ ] `/api/cron/valuation` returns 200 with summary JSON on success
- [ ] `/api/cron/valuation` returns 401 if OIDC token missing or invalid
- [ ] `/api/cron/valuation` returns 500 with error if batch throws unexpectedly
- [ ] Structured log emitted at batch start (`valuation_batch_start`) and complete (`valuation_batch_complete`, with `total`, `updated`, `skipped`, `errors`, `duration_ms`)
- [ ] Add-stock pipeline (STORY-056) can call `runValuationBatch({ tickerFilter: ticker })` as the final pipeline stage after classification

## Test Strategy Expectations
- Unit tests:
  - `runValuationBatch()`: all stocks processed; one error → counted, not thrown; tickerFilter → single stock only
  - `?force=true` propagated to `persistValuationState` calls
- Integration tests:
  - POST /api/cron/valuation with valid OIDC token → 200 + summary
  - POST /api/cron/valuation without token → 401
  - POST /api/cron/valuation?force=true → all stocks recomputed (skipped count = 0)
- Regression:
  - Adding `runValuationBatch` to add-stock pipeline does not break the existing SSE flow (STORY-056)

## Regression / Invariant Risks
- Pipeline order: valuation batch must run after classification batch (nightly schedule already sequenced via Cloud Scheduler timing: classification=8 PM ET, valuation=8:15 PM ET)
- `tickerFilter` path: must process exactly 1 stock, not 0 and not all

## Definition of Done
- [ ] `src/modules/valuation/valuation-batch.service.ts` implemented
- [ ] `src/app/api/cron/valuation/route.ts` placeholder replaced with real implementation
- [ ] Unit + integration tests passing
- [ ] Add-stock pipeline updated: Stage 11 (valuation) added; `TOTAL_STAGES` updated to 11 in route + `AddStockModal.tsx`
- [ ] Implementation log updated
- [ ] Traceability comments in all new files (`// EPIC-005: ... STORY-077: ...`)

## Traceability
- Epic: EPIC-005 — Valuation Threshold Engine & Enhanced Universe
- RFC: RFC-003 — Valuation & Threshold Engine Architecture §Batch Job
- ADR: ADR-002 — Nightly Pipeline Execution Order (classification→valuation)
- ADR: ADR-008 — OIDC Authentication for Cron Routes
- STORY-007: Cloud Scheduler job (valuation slot pre-registered)
- STORY-056: Add Stock to Universe (pipeline integration)
