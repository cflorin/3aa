# STORY-022 — Data Freshness Tracking

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Implement the data freshness utility that computes `data_freshness_status` (fresh / stale / missing) per stock based on when each data category was last synced, and integrate it as a post-step in the three daily sync jobs. This is a named deliverable of EPIC-003 and a first-class input to EPIC-004 and EPIC-005: the classification engine and valuation engine need to know whether their input data is trustworthy before acting on it.

## Story
As the **data pipeline and downstream engines**,
I want **data freshness status tracked per stock per data category**,
so that **classification and valuation engines can distinguish between fresh, stale, and missing data before acting on it**.

## Outcome
- `computeFreshnessStatus(stock)` utility function determines freshness for price, fundamentals, and estimates categories
- After each daily sync job completes, `data_freshness_status` on the `stocks` table is updated for every processed stock
- Sync job response summaries include `{ fresh_count, stale_count, missing_count }`
- `data_freshness_status` reflects the worst-case category across all three data types

## Scope In
- `src/modules/data-ingestion/freshness.util.ts` — `computeFreshnessStatus(input: FreshnessInput): FreshnessResult`:
  - Input: `{ price_last_updated_at: Date | null, fundamentals_last_updated_at: Date | null, estimates_last_updated_at: Date | null, now?: Date }`
  - Per-category thresholds (RFC-004 §Data Freshness):
    - Price: fresh if synced < 2 days ago; stale if 2–5 days; missing if > 5 days or never synced
    - Fundamentals: fresh if < 90 days; stale if 90–180 days; missing if > 180 days or never synced
    - Estimates: fresh if < 90 days; stale if 90–180 days; missing if > 180 days or never synced
  - Boundary rules: exactly 2 days = stale (not fresh); exactly 90 days = stale; exactly 5 days = stale (not missing); exactly 180 days = missing
  - Output type `FreshnessResult`:
    - `price: 'fresh' | 'stale' | 'missing'`
    - `fundamentals: 'fresh' | 'stale' | 'missing'`
    - `estimates: 'fresh' | 'stale' | 'missing'`
    - `overall: 'fresh' | 'stale' | 'missing'`
  - Overall rule: `missing` if any category is missing; `stale` if any category is stale (and none missing); `fresh` only if all three are fresh
  - `now` parameter: defaults to `new Date()` but injectable for deterministic testing
- Integration into sync jobs (modifications to STORY-019, STORY-020, STORY-021 implementations):
  - `syncPrices()`: after each price write, call `computeFreshnessStatus()` and `UPDATE stocks SET data_freshness_status`
  - `syncFundamentals()`: same
  - `syncForwardEstimates()`: same
  - Each sync job response adds: `{ fresh_count, stale_count, missing_count }`
- Newly inserted stocks (universe sync, STORY-018) with no sync history: `data_freshness_status = 'missing'` set at insert time

## Scope Out
- Per-field freshness granularity beyond the three categories (V1 is category-level only)
- Automated remediation (re-triggering sync when data is stale — V2+)
- User-visible freshness warnings in UI (EPIC-006)
- Admin observability endpoint for freshness counts — not in EPIC-003 spec scope; deferred or to be added by a later epic (see Boundary Question #8)
- Push notifications or alerts based on freshness status (EPIC-006)
- Historical freshness audit trail (V1 records current status only)

## Dependencies
- **Epic:** EPIC-003 — Data Ingestion & Universe Management
- **PRD:** Section 16 (Data Freshness Rules — threshold values)
- **RFCs:** RFC-002 (`stocks` table — `data_freshness_status`, `price_last_updated_at`, `fundamentals_last_updated_at`, `estimates_last_updated_at`), RFC-004 §Data Freshness
- **ADRs:** ADR-010 (TypeScript)
- **Upstream stories:** STORY-019 (sets `price_last_updated_at`), STORY-020 (sets `fundamentals_last_updated_at`), STORY-021 (sets `estimates_last_updated_at`)

## Preconditions
- `stocks` table has `data_freshness_status`, `price_last_updated_at`, `fundamentals_last_updated_at`, `estimates_last_updated_at` columns
- STORY-019, STORY-020, STORY-021 exist for this story to integrate into

## Inputs
- `price_last_updated_at`, `fundamentals_last_updated_at`, `estimates_last_updated_at` from `stocks` row
- Current timestamp (injectable for testing)

## Outputs
- `stocks.data_freshness_status` updated to `'fresh'`, `'stale'`, or `'missing'` after each sync job run
- `fresh_count`, `stale_count`, `missing_count` included in each sync job response summary

## Acceptance Criteria
- [ ] `computeFreshnessStatus` returns `price: 'fresh'` when `price_last_updated_at` is within 2 days of now (strictly < 2 days)
- [ ] `computeFreshnessStatus` returns `price: 'stale'` when `price_last_updated_at` is ≥ 2 days and ≤ 5 days ago
- [ ] `computeFreshnessStatus` returns `price: 'missing'` when `price_last_updated_at` is > 5 days ago or null
- [ ] `computeFreshnessStatus` returns `fundamentals: 'fresh'` when `fundamentals_last_updated_at` is < 90 days ago
- [ ] `computeFreshnessStatus` returns `fundamentals: 'stale'` when ≥ 90 days and ≤ 180 days ago
- [ ] `computeFreshnessStatus` returns `fundamentals: 'missing'` when > 180 days ago or null
- [ ] `estimates` category uses same thresholds as fundamentals
- [ ] Overall `'missing'` when any category is missing
- [ ] Overall `'stale'` when any category is stale and none missing
- [ ] Overall `'fresh'` only when all three categories are fresh
- [ ] `data_freshness_status` updated in `stocks` table at end of each daily sync job run
- [ ] Sync job responses include `{ fresh_count, stale_count, missing_count }`
- [ ] Newly inserted stock (no sync history) has `data_freshness_status = 'missing'`
- [ ] `now` parameter is injectable; tests use injected time (no flaky real-clock dependency)

## Test Strategy Expectations
- Unit tests (pure function — no DB, no I/O):
  - Price 1 day ago, fundamentals 30 days, estimates 30 days → all fresh → overall fresh
  - Price 3 days ago → price stale → overall stale
  - Price null → price missing → overall missing (even if fundamentals fresh)
  - Fundamentals 91 days ago → fundamentals stale; estimates 181 days ago → estimates missing → overall missing
  - Boundary: exactly 2 days = stale (not fresh); exactly 90 days = stale; exactly 5 days = stale (not missing); exactly 180 days = missing
  - All 8 combinations of category statuses → correct overall
  - One stale + one missing + one fresh → overall missing (missing wins over stale)
- Integration tests (real test DB):
  - After `syncPrices()` runs: `data_freshness_status` updated correctly
  - After all three sync jobs run: `data_freshness_status = 'fresh'` for stocks with same-day data
  - New stock from `syncUniverse()` with no sync history: `data_freshness_status = 'missing'`
  - Sync job responses contain `fresh_count`, `stale_count`, `missing_count` fields
- Contract/schema tests:
  - `data_freshness_status` column has DB constraint allowing only `'fresh'`, `'stale'`, `'missing'` values
- BDD acceptance tests:
  - "Given price synced today, fundamentals and estimates synced within 30 days, then data_freshness_status = 'fresh'"
  - "Given price not synced for 3 days, then data_freshness_status = 'stale'"
  - "Given estimates never synced, then data_freshness_status = 'missing' regardless of price/fundamentals"
- E2E tests:
  - After full nightly batch in staging: `SELECT COUNT(*) FROM stocks WHERE data_freshness_status = 'missing' AND in_universe = TRUE` is near zero

## Regression / Invariant Risks
- **Threshold drift:** A code change shifts the price stale threshold from 2 days to 20 days. Protection: unit tests use injected `now` and pin exact threshold boundary values.
- **Freshness not updated after sync:** A sync job is modified and the freshness post-step accidentally removed. Protection: integration test after each sync job type asserts `data_freshness_status` was updated.
- **Overall status rule wrong:** Missing in one category but computed as stale. Protection: all 8 category combinations tested explicitly.
- **Real clock in tests:** Using `new Date()` inside the utility makes tests time-dependent and flaky. Protection: `now` is an injectable parameter; all unit tests inject a fixed timestamp.

## Key Risks / Edge Cases
- Exactly at threshold boundary (e.g. exactly 2 days = 172,800 seconds): boundary rule is `>= 2 days = stale`; tests must inject exact boundary timestamps to avoid ambiguity
- `estimates_last_updated_at` null for all stocks before STORY-021 runs for the first time: status is `missing`, which is correct — no special handling needed
- The `now` injection pattern must be used in integration tests too (pass a fixed timestamp) to avoid test failures near midnight or other boundary times

## Baseline Conflicts (discovered 2026-04-20)

### BC-022-001 — `country` required field missing from integration test `beforeAll` upsert
- **Baseline assumption:** `stocks` upsert `create` only requires `ticker`, `companyName`, `inUniverse`
- **Reality:** Prisma schema has `country String @db.VarChar(2)` — non-nullable, no default. All `create` calls must include it. `PrismaClientValidationError: + country: String` on `beforeAll` upsert causes all 4 integration tests to fail.
- **Resolution:** Add `country: 'US'` to the `create` payload in `beforeAll`
- **Pattern:** Same class of bug as BC-019-001, BC-020-001, BC-021-001 — running pattern across integration tests
- **Impact:** Integration test fix only; no logic change

### BC-022-002 — `makeAdapter` mock missing `providerName`; provenance `provider` field written as undefined
- **Baseline assumption:** Adapter mock only needs `fetchEODPrice`, `fetchFundamentals`, `fetchForwardEstimates`
- **Reality:** `ProviderOrchestrator.fetchFieldWithFallback` reads `provider.providerName` to populate `source_provider` in the `FieldResult`. With `providerName` absent, `source_provider = undefined`. Provenance entries written as `{ synced_at, fallback_used }` — no `provider` key. DB provenance is malformed.
- **Impact on tests:** Freshness integration tests pass (they only check `dataFreshnessStatus`, not provenance). STORY-024 contract tests may detect missing `provider` field.
- **Resolution:** Add `providerName: 'tiingo'`/`'fmp'` and `capabilities` to `makeAdapter` helper
- **Impact:** Integration test fix only; no logic change

### BC-022-003 — No test verifies `fresh_count`/`stale_count`/`missing_count` in sync response
- **Baseline assumption:** AC "Sync job responses include `{ fresh_count, stale_count, missing_count }`" has test coverage
- **Reality:** Neither `price-sync.service.test.ts` nor `fundamentals-sync.service.test.ts` unit tests assert these fields. Integration tests don't capture the return value at all. The fields exist in the implementation (verified) but are untested.
- **Resolution:** Capture `result` in at least one integration test (e.g. Test 1 — `syncPrices` → missing) and assert `typeof result.fresh_count === 'number'`, etc. Use `>= 0` bounds to avoid dependency on total in-universe stock count in the test DB.
- **Impact:** Integration test change only; no logic change

### BC-022-004 — No integration test covers `syncForwardEstimates` freshness writing
- **Baseline assumption:** Test Strategy "after all three sync jobs run" implies all three sync types are integration-tested for freshness
- **Reality:** `freshness.util.test.ts` covers `syncPrices` (3 tests) and `syncFundamentals` (1 test). `syncForwardEstimates` freshness is not integration-tested here (it is tested in STORY-021 integration tests but not in the STORY-022 freshness context)
- **Resolution:** Add Test 5: `syncForwardEstimates writes dataFreshnessStatus correctly` — pre-seed price + fundamentals timestamps, run sync with FMP providing forward_pe, assert `dataFreshnessStatus` updated
- **Impact:** New integration test only; no logic change

## Definition of Done
- [ ] `computeFreshnessStatus()` utility implemented with injectable `now`
- [ ] Freshness computation integrated into `syncPrices()`, `syncFundamentals()`, `syncForwardEstimates()`
- [ ] Sync job response summaries include freshness counts
- [ ] Unit tests passing (all thresholds, all 8 overall-status combinations) — 26 unit tests ✅
- [ ] 5 integration tests passing after all BC fixes (BC-022-001 through BC-022-004)
- [ ] 4 baseline conflicts documented (BC-022-001 through BC-022-004)
- [ ] Regression coverage: threshold values pinned, freshness updated after each sync type
- [ ] Traceability comments referencing EPIC-003, STORY-022, RFC-004
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- PRD: Section 16 (Data Freshness Rules — threshold values)
- RFC: RFC-002 (`data_freshness_status` column, `*_last_updated_at` columns), RFC-004 §Data Freshness
- ADR: ADR-010 (TypeScript)
