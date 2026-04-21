# STORY-023 — Pipeline Integration Tests

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Add cross-story integration tests that verify the full nightly data pipeline as a system: the three daily sync jobs running in sequence against a real test database produce a correct and consistent `stocks` table state. These tests cover scenarios that cannot be covered within individual story tests — multi-job sequencing, provider failure propagation across jobs, and end-state invariants that depend on all three jobs having run.

Each individual story (STORY-015 through STORY-022) has its own integration tests scoped to that story's logic. This story adds the safety net that spans all of them.

## Story
As a **developer and operator**,
I want **a suite of cross-story integration tests for the data pipeline**,
so that **regressions in multi-job sequencing, provider fallback propagation, and end-state data consistency are caught before they reach production**.

## Outcome
- A `tests/integration/data-ingestion/pipeline.test.ts` test suite exists
- Tests verify the full daily sync sequence (price → fundamentals → estimates → freshness) against a real test DB
- Tests verify provider failure scenarios: Tiingo fully down → FMP fallback used across all three daily sync jobs
- Tests verify end-state invariants: after a full sync, the `stocks` table is in a known-correct state
- Tests verify idempotency: running all three daily sync jobs twice produces the same end state
- All tests use mocked HTTP (no live provider calls), seeded test DB, and injected timestamps

## Scope In
- `tests/integration/data-ingestion/pipeline.test.ts` — cross-story integration test suite
- **Full daily sequence test:**
  - Seed DB with universe (100 in-universe stocks with known fundamentals)
  - Run `syncPrices()` → `syncFundamentals()` → `syncForwardEstimates()` in sequence with mocked provider responses
  - Assert: all 100 stocks have `current_price`, all 15 fundamental fields, `forward_pe` populated
  - Assert: `data_freshness_status = 'fresh'` for all 100 stocks (all three categories synced same day)
  - Assert: `data_provider_provenance` structure is correct for each data category
- **Provider failure scenario (Tiingo fully down):**
  - Mock Tiingo adapter to return 5xx for all calls (orchestrator retries then falls back)
  - Run all three daily sync jobs
  - Assert: all data fields populated from FMP (fallback provider)
  - Assert: `fallback_used = true` in all provenance entries
  - Assert: batch completes with non-zero `fallback_count`; no catastrophic failure
- **Partial failure scenario (both providers fail for some stocks):**
  - Mock 10% of stock lookups returning null from both providers
  - Run sync jobs
  - Assert: 90% of stocks updated correctly; 10% have previous values preserved
  - Assert: errors counted correctly in each sync job response
- **Idempotency test:**
  - Run full daily sequence once; record `stocks` state snapshot
  - Run full daily sequence again with same mock responses
  - Assert: end state is identical; no duplicate writes; timestamps updated
- **Freshness end-state test:**
  - Run all three daily sync jobs in sequence on same injected date
  - Assert: `SELECT COUNT(*) WHERE data_freshness_status = 'fresh' AND in_universe = TRUE` equals total in-universe count
- **Stale detection test:**
  - Seed DB with `price_last_updated_at = 3 days ago`, `fundamentals_last_updated_at = 30 days ago`
  - Run only `syncFundamentals()` (not price sync)
  - Assert: fundamentals category is now fresh; price category still stale; overall status = stale

## Scope Out
- Per-story integration tests (those live in each story's own test files)
- Live provider API calls (all HTTP mocked)
- Unit tests for individual service logic
- Contract/schema validation tests (STORY-024)
- UI or API endpoint testing (no endpoints involved here; service functions only)

## Dependencies
- **Epic:** EPIC-003 — Data Ingestion & Universe Management
- **PRD:** Section 15 (Data Requirements), Section 16 (Data Freshness Rules)
- **RFCs:** RFC-004 (full pipeline specification)
- **ADRs:** ADR-001 (fallback behaviour), ADR-002 (nightly batch sequence)
- **Upstream stories:** STORY-015 through STORY-022 — all must be implemented before these tests can be written or run

## Preconditions
- All EPIC-003 service functions implemented (STORY-015 through STORY-022)
- Test database configured (same infrastructure as existing integration tests)
- Jest `maxWorkers: 1` enforced (already set — prevents DB race conditions)

## Inputs
- Seeded test database with known in-universe stocks
- Mocked HTTP responses for Tiingo and FMP adapters
- Injected timestamps for deterministic freshness calculation

## Outputs
- Passing test suite at `tests/integration/data-ingestion/pipeline.test.ts`
- Clear failure messages when any cross-story invariant is violated

## Acceptance Criteria
- [x] Full daily sequence test: all 5 test stocks have correct data after all three sync jobs run
- [x] Full daily sequence test: `data_freshness_status = 'fresh'` for all in-universe stocks after same-day sync
- [x] Full daily sequence test: `data_provider_provenance` structure correct for each data category
- [x] Provider failure test: Tiingo fully mocked as failing → FMP fallback used → all data populated
- [x] Provider failure test: price+fundamentals provenance entries show `fallback_used = true` when Tiingo fully down (estimates unaffected — FMP is primary for estimates)
- [x] Partial failure test: stocks with both providers returning null retain previous values unchanged
- [x] Partial failure test: error counts in sync summaries match the number of both-provider-null stocks
- [x] Idempotency test: second run with same mock data → identical `stocks` state (no duplicate rows, no value drift)
- [x] Stale detection test: running only fundamentals sync leaves price category stale → overall = stale
- [x] All tests use mocked HTTP; no real provider API calls made
- [x] All tests use injected `now` timestamps; no real-clock dependency

## Test Strategy Expectations
- Unit tests: not applicable (this story is itself an integration test story)
- Integration tests:
  - All scenarios described in Scope In above, run against a real test DB
  - Each test seeds and tears down its own DB state
  - Marked `@pipeline-integration` for selective execution
- Contract/schema tests: not applicable here (STORY-024)
- BDD acceptance tests:
  - "Given all providers available, when full daily sync runs, then all stocks have fresh data and correct provenance"
  - "Given Tiingo fully unavailable, when full daily sync runs, then FMP fallback used for all stocks and batch completes"
  - "Given full sync run twice with same data, then end state is identical on both runs"
- E2E tests:
  - Staging environment: manual trigger of all three cron endpoints in sequence → verify `stocks` table end state

## Regression / Invariant Risks
- **Job sequencing dependency broken:** A refactor changes the order in which jobs are invoked; prices might be fetched before the universe is populated. Protection: sequence tests verify universe is seeded before sync jobs run.
- **Fallback propagation failure:** Tiingo down causes price sync to succeed via FMP, but fundamentals sync is not updated to use fallback, leaving half the data missing. Protection: provider-failure test runs all three jobs and verifies all data categories populated via fallback.
- **Freshness tracking disconnected from sync:** Sync jobs updated but freshness post-step accidentally removed from one job. Protection: full-sequence freshness test verifies all three `*_last_updated_at` fields updated after respective sync.
- **Idempotency broken:** Second sync run produces duplicate rows or overwrites with different values. Protection: idempotency test compares full `stocks` table snapshot before and after second run.

## Key Risks / Edge Cases
- Test database must be fully isolated between test runs (each test seeds its own state); shared state between tests causes false positives
- Injected timestamps must be consistent across all service calls within a single test scenario; each scenario should use a single fixed `now` value
- Provider failure test must simulate 5xx (transient, retriable) not 4xx (permanent) to test the retry-then-fallback path through the orchestrator

## Baseline Conflicts (discovered 2026-04-20)

### BC-023-001 — TEST_TICKERS names too long for VarChar(10)
- **Baseline assumption:** `PIPE_TEST_000` through `PIPE_TEST_004` are valid ticker values
- **Reality:** `PIPE_TEST_000` = 13 chars; `stocks.ticker` is `VarChar(10)`. `seedTestStocks()` fails with `PrismaClientKnownRequestError: value too long for column type` — all 6 tests fail before any scenario logic runs
- **Resolution:** Rename to `PT_000` through `PT_004` (6 chars); update `startsWith: 'PIPE_TEST_'` cleanup filter to `{ in: TEST_TICKERS }`
- **Pattern:** Same class of bug as BC-019-001, BC-020-001, BC-021-001, BC-022-001
- **Impact:** Test-only fix; no logic change

### BC-023-003 — Spec specifies 100 test stocks; implementation uses 5
- **Baseline assumption (Scope In + AC):** "Seed DB with universe (100 in-universe stocks...)", "all 100 stocks have correct data"
- **Reality:** `TEST_TICKERS` has 5 entries. 5 is sufficient to validate all scenarios; 100 adds runtime without coverage benefit.
- **Resolution (V1 accepted):** Spec updated to say "5 test stocks". No code change.
- **Impact:** Spec update only

### BC-023-004 — Scenario 1 provenance check covers only `current_price`; AC requires all three data categories
- **Baseline assumption:** AC "data_provider_provenance structure correct for each data category" is covered
- **Reality:** Scenario 1 only checks `prov?.['current_price']` is defined. No check for a fundamentals field (e.g. `gross_margin`) or `forward_pe` provenance.
- **Resolution:** Add checks in Scenario 1 for `prov?.['gross_margin']` (written by `syncFundamentals`) and `prov?.['forward_pe']` (written by `syncForwardEstimates`)
- **Impact:** Test change only; no logic change

### BC-023-005 — Scenario 2 (Tiingo down) does not run `syncForwardEstimates`
- **Baseline assumption (Scope In):** "Run all three daily sync jobs" for the provider failure scenario
- **Reality:** Scenario 2 only calls `syncPrices` and `syncFundamentals`. For estimates, FMP is primary and Tiingo is fallback — with FMP healthy, estimates succeed with `fallback_used: false`. The test should still invoke all three to match the spec intent.
- **Resolution:** Add `await syncForwardEstimates(fmp, tiingoDown, { now: FIXED_NOW })` to Scenario 2. No fallback assertion needed for estimates (FMP is primary; Tiingo-down doesn't trigger fallback for estimates).
- **Impact:** Test change only; no logic change

### BC-023-002 — No DB isolation; 5606 live-proof in-universe stocks corrupt count assertions and cause timeouts
- **Baseline assumption:** Test DB contains only the 5 seeded test stocks as in-universe rows
- **Reality:** The live_provider_verified proof for STORY-018 inserted 5606 Tiingo tickers with `inUniverse = TRUE` into the test DB. `syncPrices/syncFundamentals/syncForwardEstimates` process ALL in-universe stocks — count assertions like `priceResult.stocks_updated === 5` fail (actual ≈ 5611), and Scenario 1 (3 full sync passes over 5611 stocks) will timeout within the 30s Jest limit
- **Resolution:** In `beforeAll`, set all pre-existing stocks to `inUniverse = false`. In `afterAll`, restore. This makes the test stocks the only in-universe rows throughout the suite, isolating counts and preventing timeout
- **Impact:** `beforeAll`/`afterAll` structure change in test file; no logic change to scenarios

## Definition of Done
- [x] `tests/integration/data-ingestion/pipeline.test.ts` passing after all 5 BC fixes
- [x] All six scenario types passing (full sequence, Tiingo down, partial failure, idempotency, freshness end-state, stale detection)
- [x] 5 baseline conflicts documented (BC-023-001 through BC-023-005)
- [x] Tests run against real test DB (no API keys required; all HTTP mocked)
- [x] Traceability comments referencing EPIC-003, STORY-023, RFC-004, ADR-001, ADR-002
- [x] Implementation log updated

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- PRD: Section 15 (Data Requirements), Section 16 (Data Freshness Rules)
- RFC: RFC-004 (full pipeline specification)
- ADR: ADR-001 (multi-provider fallback), ADR-002 (nightly batch sequence)
