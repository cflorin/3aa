# STORY-019 — Price Sync Job

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Implement the daily EOD price sync job that updates `current_price` for every in-universe stock, with Tiingo as primary and FMP as fallback, tracking provenance per stock. This gives the valuation engine fresh price data every trading day.

## Story
As the **data pipeline**,
I want **a daily EOD price sync job** that updates `current_price` for all in-universe stocks,
so that **the valuation engine always has fresh end-of-day prices and knows which provider supplied them**.

## Outcome
- `syncPrices()` service function updates `stocks.current_price` for all `in_universe = TRUE` stocks
- Provider priority: Tiingo primary, FMP fallback (per ADR-001)
- `stocks.price_last_updated_at` updated on every successful price write
- `stocks.data_provider_provenance.current_price` updated with `{ provider, synced_at, fallback_used }`
- Stocks with no price from either provider: `current_price` left unchanged, error logged
- `POST /api/cron/price-sync` endpoint triggers the job; protected by OIDC auth
- Cloud Scheduler daily job: Monday–Friday, 5:00 PM ET

## Scope In
- `src/modules/data-ingestion/jobs/price-sync.service.ts` — `syncPrices()` function:
  - Queries `SELECT ticker FROM stocks WHERE in_universe = TRUE`
  - For each ticker: `orchestrator.fetchFieldWithFallback('eod_price', [TiingoAdapter, FMPAdapter])`
  - If `result.value !== null`: UPDATE `stocks.current_price`, `price_last_updated_at`, `data_provider_provenance.current_price`
  - If `result.value === null`: log data quality issue; do NOT update `current_price`
  - Returns `{ stocks_updated: number, fallback_count: number, errors: number, duration_ms: number }`
  - Structured logging: per-stock fallback events, completion summary
- `src/app/api/cron/price-sync/route.ts` — `POST /api/cron/price-sync`:
  - OIDC auth via `verifySchedulerToken()`; 401 if invalid
  - Returns 200 with sync summary JSON; 500 on uncaught error
- Cloud Scheduler job: Mon–Fri 5:00 PM ET, target `POST /api/cron/price-sync`, OIDC service account

## Scope Out
- Fundamentals or forward estimates (STORY-020, STORY-021)
- Historical price series (V1 current-state only)
- Intraday or real-time prices
- Triggering classification/valuation recompute (downstream epics)
- Note: data freshness status IS computed inline (STORY-022 logic baked into this service early — see BC-019-002)

## Dependencies
- **Epic:** EPIC-003 — Data Ingestion & Universe Management
- **PRD:** Section 15 (Data Requirements — daily EOD prices), Section 16 (prices stale after 2 days)
- **RFCs:** RFC-002 (`stocks` table — `current_price`, `price_last_updated_at`, `data_provider_provenance`), RFC-004 §Price Sync
- **ADRs:** ADR-001 (Tiingo primary for prices; FMP fallback), ADR-002 (daily 5pm ET price sync), ADR-008 (Cloud Scheduler)
- **Upstream stories:** STORY-015 (ProviderOrchestrator), STORY-016 (TiingoAdapter), STORY-017 (FMPAdapter), STORY-018 (`stocks` table populated with `in_universe = TRUE` stocks)

## Preconditions
- `stocks` table has `current_price`, `price_last_updated_at`, `data_provider_provenance` columns
- At least one `in_universe = TRUE` stock exists

## Inputs
- Cloud Scheduler POST with OIDC token
- In-universe tickers from `stocks` table
- EOD price from Tiingo (primary) or FMP (fallback)

## Outputs
- `stocks.current_price` updated per successfully synced stock
- `stocks.price_last_updated_at` = current timestamp
- `stocks.data_provider_provenance.current_price = { provider, synced_at, fallback_used }`
- Response: `{ stocks_updated, fallback_count, errors, fresh_count, stale_count, missing_count, duration_ms }` [BC-019-002: actual return includes freshness counts]

## Acceptance Criteria
- [ ] `syncPrices()` queries only `in_universe = TRUE` stocks
- [ ] Tiingo tried first; FMP tried only if Tiingo returns null
- [ ] `current_price` updated only when non-null price obtained; never set to null
- [ ] `data_provider_provenance.current_price = { provider: 'tiingo' | 'fmp', synced_at, fallback_used }`
- [ ] `fallback_used = true` when FMP was used because Tiingo returned null
- [ ] Stocks for which both providers return null: `current_price` unchanged; logged; counted in `errors`
- [ ] `fallback_count` equals number of stocks where FMP was used instead of Tiingo
- [ ] `POST /api/cron/price-sync` without valid OIDC token → 401; sync not run
- [ ] `POST /api/cron/price-sync` with valid token → 200 with summary JSON
- [ ] `in_universe = FALSE` stocks are not fetched or updated

## Test Strategy Expectations
- Unit tests — service (mocked orchestrator + mocked DB):
  - Tiingo returns price → `current_price` updated; `fallback_used: false`
  - Tiingo null, FMP returns price → `current_price` updated; `fallback_used: true`; `fallback_count = 1`
  - Both null → `current_price` unchanged; `errors = 1`; no DB UPDATE issued
  - `in_universe = FALSE` stock not in processing list — verify `findMany` called with `{ where: { inUniverse: true } }` [BC-019-003]
  - Tiingo 5xx → orchestrator retries then falls back to FMP (orchestrator-level; covered by STORY-015 tests)
  - 3 stocks: 2 Tiingo, 1 FMP fallback → `fallback_count = 1`, `stocks_updated = 3`
  - Provenance `fallback_used` is boolean, `synced_at` is ISO string
- Unit tests — route (`POST /api/cron/price-sync`):
  - Invalid/missing OIDC token → 401; `syncPrices()` not called [BC-019-003]
  - Valid OIDC token → 200 with sync summary JSON [BC-019-003]
- Integration tests (real test DB + mocked adapters):
  - `syncPrices()` with mock responses → correct DB state, provenance JSONB correct
  - Fallback scenario → `fallback_used: true` in provenance
  - Both null → `current_price` unchanged after sync
  - Idempotency: run twice with same mock data → same `current_price`; `price_last_updated_at` updated
- Contract/schema tests:
  - `data_provider_provenance.current_price` JSONB shape: `{ provider: string, synced_at: ISO string, fallback_used: boolean }`
- BDD acceptance tests:
  - "Given Tiingo has price for AAPL, when price sync runs, then current_price from Tiingo and fallback_used=false"
  - "Given Tiingo no price for XYZ but FMP has it, when price sync runs, then current_price from FMP and fallback_used=true"
  - "Given both providers no price for XYZ, when price sync runs, then XYZ.current_price unchanged"
- E2E tests:
  - Full price sync against real providers in staging: 1,000+ stocks updated

## Regression / Invariant Risks
- **Null overwrites valid price:** UPDATE issued even when `result.value === null`. Protection: unit test that both-null → no DB UPDATE issued.
- **Provenance not written:** Price updated but `data_provider_provenance.current_price` not written. Protection: integration test reads provenance after sync and asserts structure.
- **Out-of-universe stocks updated:** `in_universe = FALSE` stocks included in processing. Protection: unit test mocks DB query and asserts only `in_universe = TRUE` tickers processed.
- **fallback_count miscounted:** Protection: unit test with known fallback scenario asserts exact count.

## Key Risks / Edge Cases
- Non-trading day (weekend/holiday): providers return most recent available price; adapter handles this; not an error condition
- Partial sync failure: 900/1,000 stocks succeed, 100 fail; partial completion acceptable; successful writes not rolled back
- Rate limits cause slow batch: 1,000 stocks sequential; rate limit errors must be caught, logged, counted as errors — not abort the entire sync

## Baseline Conflicts (discovered 2026-04-20)

### BC-019-001: Integration test ticker exceeds VarChar(10)
- **Issue:** `TEST_TICKER = 'INTTEST_PRICE'` = 13 chars; schema `ticker @db.VarChar(10)`
- **Impact:** All 4 integration tests fail against real DB ("value too long for column")
- **Fix:** `'INTTEST_PRICE'` → `'T_PRICE'` (7 chars)
- **RFC/ADR impact:** None — schema constraint is correct; fixture was wrong

### BC-019-002: PriceSyncResult includes STORY-022 freshness fields not in spec
- **Issue:** Actual return type includes `fresh_count`, `stale_count`, `missing_count` (STORY-022 baked in early)
- **Spec expected:** `{ stocks_updated, fallback_count, errors, duration_ms }`
- **Resolution:** Forward-compatible extension; no behaviour change; spec updated to document actual shape

### BC-019-003: Route test for OIDC endpoint missing
- **Issue:** Story spec requires OIDC 401/200 tests; no `tests/unit/api/cron/price-sync.test.ts` exists
- **Fix:** Create route test file with 2 unit tests (mocked `verifySchedulerToken`)

## Definition of Done
- [ ] `syncPrices()` implemented with correct Prisma + orchestrator pattern
- [ ] `POST /api/cron/price-sync` endpoint with OIDC auth implemented
- [ ] Cloud Scheduler Mon–Fri 5pm ET job configured
- [ ] 9 unit tests passing: 7 service tests + 2 route tests (existing 6 + in_universe=FALSE test + 2 OIDC route tests)
- [ ] 4 integration tests passing against real test DB (fixture ticker fixed — BC-019-001)
- [ ] Regression coverage: null-not-overwrite, provenance written, out-of-universe excluded, fallback_count, OIDC auth
- [ ] Traceability comments referencing EPIC-003, STORY-019, RFC-004, ADR-001, ADR-002
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- PRD: Section 15 (Data Requirements — daily EOD prices), Section 16 (2-day stale threshold)
- RFC: RFC-002 (stocks schema — current_price, provenance), RFC-004 §Price Sync
- ADR: ADR-001 (Tiingo primary for prices), ADR-002 (daily 5pm ET slot), ADR-008 (Cloud Scheduler)
