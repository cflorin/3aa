# STORY-020 — Fundamentals Sync Job

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Implement the daily fundamentals sync that updates growth, profitability, and balance sheet metrics for all in-universe stocks, using Tiingo as primary and FMP as fallback. This data is the primary input to the classification engine (EPIC-004) and the valuation engine (EPIC-005); without it, neither engine can produce outputs.

## Story
As the **data pipeline**,
I want **a daily fundamentals sync job** that populates growth, profitability, and balance sheet fields for all in-universe stocks,
so that **the classification engine has the inputs it needs to assign 3AA codes**.

## Outcome
- `syncFundamentals()` updates all 15 fundamental fields on the `stocks` table for `in_universe = TRUE` stocks
- Provider priority: Tiingo primary, FMP fallback (per ADR-001)
- Each written field has its provenance recorded in `data_provider_provenance`
- A field that returns null from a provider is not used to overwrite a currently non-null DB value
- `POST /api/cron/fundamentals` endpoint triggers the job; OIDC-protected
- Cloud Scheduler daily job: Monday–Friday, 6:00 PM ET

## Scope In
- `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` — `syncFundamentals()` function:
  - Queries `SELECT ticker FROM stocks WHERE in_universe = TRUE`
  - For each ticker: calls orchestrator (Tiingo primary, FMP fallback) to fetch `FundamentalData`
  - Updates the following fields when non-null data received:
    - Growth: `revenue_growth_3y`, `revenue_growth_fwd`, `eps_growth_3y`, `eps_growth_fwd`, `gross_profit_growth`
    - Profitability: `gross_margin`, `operating_margin`, `fcf_margin`, `fcf_conversion`, `roic`, `net_income_positive`, `fcf_positive`
    - Balance sheet: `net_debt_to_ebitda`, `interest_coverage`, `share_count_growth_3y`
  - Updates `data_provider_provenance` for each field written: `{ provider, synced_at, fallback_used }`
  - Updates `fundamentals_last_updated_at`
  - Does NOT overwrite a field with null if current DB value is non-null
  - Returns `{ stocks_updated, fields_populated, fallback_count, errors, duration_ms }`
  - Structured logging: per-stock outcome, completion summary
- `src/app/api/cron/fundamentals/route.ts` — `POST /api/cron/fundamentals`:
  - OIDC auth via `verifySchedulerToken()`; 401 if invalid
  - Returns 200 with summary JSON; 500 on uncaught error
- Cloud Scheduler job: Mon–Fri 6:00 PM ET, target `POST /api/cron/fundamentals`, OIDC service account

## Scope Out
- Forward estimates (STORY-021)
- Manual flags (`holding_company_flag`, `binary_flag`, `cyclicality_flag`, etc.) — set by classification engine in EPIC-004, not here
- Historical fundamentals time series (V1 is current-state snapshot only)
- Data quality alerts to users (EPIC-006)
- Triggering classification recompute (EPIC-004)
- `revenue_growth_fwd`, `gross_profit_growth`, `fcf_positive`, `share_count_growth_3y` — absent from V1 `FundamentalData` interface; V1 uses proxy fields (see BC-020-003)

## Dependencies
- **Epic:** EPIC-003 — Data Ingestion & Universe Management
- **PRD:** Section 15 (Data Requirements — fundamentals fields list)
- **RFCs:** RFC-001 §FundamentalFields (canonical list of required fields for classification), RFC-002 (`stocks` table — all fundamental columns), RFC-004 §Fundamentals Sync
- **ADRs:** ADR-001 (Tiingo primary for fundamentals; FMP fallback), ADR-002 (daily 6pm ET slot), ADR-008 (Cloud Scheduler)
- **Upstream stories:** STORY-015 (ProviderOrchestrator), STORY-016 (TiingoAdapter), STORY-017 (FMPAdapter), STORY-018 (universe populated)

## Preconditions
- `stocks` table has all 15 fundamental columns (RFC-002 schema; EPIC-001 STORY-004)
- Universe populated with at least one `in_universe = TRUE` stock

## Inputs
- Cloud Scheduler POST with OIDC token
- In-universe tickers from `stocks` table
- Fundamentals responses from Tiingo (primary) / FMP (fallback)

## Outputs
- `stocks` table: up to 15 fundamental fields written per stock where non-null
- `data_provider_provenance` updated per written field
- `fundamentals_last_updated_at` updated per stock after any write
- Response: `{ stocks_updated, fields_populated, fallback_count, errors, duration_ms }`

## Acceptance Criteria
- [ ] `syncFundamentals()` processes only `in_universe = TRUE` stocks
- [ ] Tiingo called first; FMP called only when Tiingo returns null for a stock
- [ ] All 15 fields written when provider returns non-null data
- [ ] A field is NOT overwritten with null if current DB value is non-null and provider returned null for that field
- [ ] `data_provider_provenance` updated for each written field with correct `provider`, `synced_at`, `fallback_used`
- [ ] `fundamentals_last_updated_at` updated per stock after at least one field is written
- [ ] Provenance key not written for fields that were not updated (null provider return → no provenance update for that field)
- [ ] `fallback_count` reflects number of stocks that used FMP
- [ ] `POST /api/cron/fundamentals` without valid OIDC token → 401; sync not run
- [ ] `POST /api/cron/fundamentals` with valid token → 200 with summary JSON
- [ ] Cloud Scheduler configured for Mon–Fri 6:00 PM ET
- [ ] Partial field coverage: if Tiingo returns 10 of 15 fields and FMP returns 3 additional, all 13 written with correct per-field provenance

## Test Strategy Expectations
- Service unit tests (mocked orchestrator + mocked DB) — 9 tests:
  - Tiingo returns full `FundamentalData` → all mappable fields written; provenance `fallback_used: false`
  - Tiingo null, FMP returns data → fields written; provenance `fallback_used: true`
  - Both null → no fields updated; errors count incremented; no DB calls
  - Partial data (some fields null in provider response) → non-null fields written; null fields absent from update data
  - All fields null in provider response → no UPDATE issued; stocks_updated = 0
  - Provenance written per written field with boolean `fallback_used`
  - `fundamentals_last_updated_at` included in update when fields written
  - `findMany` called with `{ where: { inUniverse: true }, select: { ticker: true } }` (inUniverse=TRUE filter)
  - Provenance key absent for null fields: if `gross_margin` null in response, `prov['gross_margin']` not present
- Route unit tests (mocked verifySchedulerToken + mocked syncFundamentals) — 2 tests:
  - Invalid OIDC token → 401; syncFundamentals not called
  - Valid OIDC token → 200 with summary JSON
- Integration tests (real test DB + mocked adapters) — 4 tests:
  - `syncFundamentals()` with mock full data → fundamental fields and provenance written to DB
  - FMP fallback: Tiingo null, FMP returns data → `fallback_used: true` provenance in DB
  - Null-not-overwrite: seed known `trailingPe`; sync with `trailing_pe: null` → DB value preserved
  - Idempotency: second run with same data → `fundamentals_last_updated_at` updates; values stable
- Contract/schema tests (STORY-024):
  - `data_provider_provenance.{field_name}` shape valid for written fields
  - `stocks` table: all fundamental field columns exist with correct types
- E2E tests (staging only):
  - Non-null field count per stock > 10 after fundamentals sync

## Regression / Invariant Risks
- **Null-overwrite regression:** Code change causes null values to overwrite valid data. Protection: unit test verifies no UPDATE issued for fields where provider returned null; integration test reads field before and after null-return sync.
- **Provenance written for unwritten fields:** Provenance key appears for field whose value was null. Protection: unit test checks no provenance key written for fields not updated.
- **Field name mismatch in normalization:** Provider response field mapped to wrong `stocks` column. Protection: contract test pins normalization mapping explicitly.
- **`fundamentals_last_updated_at` not updated:** Downstream engines cannot distinguish fresh from stale. Protection: integration test asserts timestamp updated after sync.

## Key Risks / Edge Cases
- Tiingo may require separate API calls for income statement and balance sheet; `FundamentalData` normalization must merge both before returning
- Negative ROIC or negative FCF are valid values; must not be treated as null
- `net_debt_to_ebitda` with EBITDA = 0 → division by zero in provider's calculation; normalization must treat this as null
- `net_income_positive` and `fcf_positive` are booleans; must not be null if underlying income/FCF figures are available

## Baseline Conflicts

### BC-020-001 — Integration test ticker exceeds VarChar(10)
- **Baseline assumption:** Integration test fixtures use `TEST_TICKER = 'INTTEST_FUND'` (12 chars)
- **Conflict:** `stocks.ticker` is VarChar(10); INSERT fails with "value too long for column"
- **Resolution:** Change `TEST_TICKER` to `'T_FUND'` (6 chars); same pattern as BC-018-001 and BC-019-001
- **Impact:** Test fix only; no schema or service change

### BC-020-002 — Missing route unit test
- **Baseline assumption:** Speculative implementation included no `tests/unit/api/cron/fundamentals.test.ts`
- **Conflict:** Story AC requires OIDC 401/200 coverage; pattern established in STORY-019 requires route unit tests for every cron endpoint
- **Resolution:** Create `tests/unit/api/cron/fundamentals.test.ts` with 2 tests (401 on invalid token, 200 on valid token)
- **Impact:** New test file only; no service change

### BC-020-003 — FundamentalData interface missing 4 of 15 canonical fields
- **Baseline assumption (RFC-001 §FundamentalFields):** 15 canonical fields: `revenue_growth_3y`, `revenue_growth_fwd`, `eps_growth_3y`, `eps_growth_fwd`, `gross_profit_growth`, `gross_margin`, `operating_margin`, `fcf_margin`, `fcf_conversion`, `roic`, `net_income_positive`, `fcf_positive`, `net_debt_to_ebitda`, `interest_coverage`, `share_count_growth_3y`
- **Conflict:** `FundamentalData` interface (V1 adapter contract) lacks `revenue_growth_fwd`, `gross_profit_growth`, `fcf_positive`, `share_count_growth_3y`; V1 service uses proxy fields with documented comments (`net_margin` → `fcf_margin`, `roe` → `fcf_conversion`, `debt_to_equity` → `net_debt_to_ebitda`)
- **Resolution (V1 accepted):** V1 service writes proxy-mapped fields; missing 4 fields scoped out of V1. A future RFC amendment should add these fields to `FundamentalData` when provider adapters can supply them. No story AC change — scope out section updated.
- **Impact:** V1 writes up to ~12 fields rather than all 15; classification engine (EPIC-004) must tolerate null for the 4 missing fields

### BC-020-004 — Missing unit test: inUniverse=TRUE filter assertion
- **Baseline assumption:** Speculative unit tests did not verify `findMany` WHERE clause
- **Conflict:** Story AC "syncFundamentals() processes only in_universe = TRUE stocks" has no test coverage
- **Resolution:** Add test 8 asserting `findMany` called with `{ where: { inUniverse: true }, select: { ticker: true } }`
- **Impact:** New unit test only

### BC-020-005 — Missing unit test: provenance absent for null fields
- **Baseline assumption:** Speculative test 4 checks `data.grossMargin === undefined` for null fields but does not verify provenance key is also absent
- **Conflict:** Story AC "Provenance key not written for fields that were not updated" has no test coverage
- **Resolution:** Add test 9 (or extend test 4) asserting that `prov['gross_margin']` is undefined when `gross_margin` is null in provider response
- **Impact:** New unit test assertion only

### BC-020-006 — TypeScript error: provenance spread not assignable to Prisma InputJsonValue
- **Baseline assumption:** Speculative service line 198: `dataProviderProvenance: { ...currentProv, ...provenanceUpdates }` compiles cleanly
- **Conflict:** TS2322 — `{ [x: string]: unknown }` not assignable to `JsonNull | InputJsonValue | undefined`; same pattern as fixed in STORY-018 and STORY-019
- **Resolution:** Cast spread to `Prisma.InputJsonValue`: `dataProviderProvenance: { ...currentProv, ...provenanceUpdates } as Prisma.InputJsonValue`
- **Impact:** One-line fix in service; no logic change

### BC-020-007 — TypeScript error: integration test JSON cast needs double-cast
- **Baseline assumption:** Integration test lines 96, 118 cast Prisma JSON result directly to `Record<string, ProvenanceEntry>`
- **Conflict:** TS2352 — neither type sufficiently overlaps; must go through `unknown` first
- **Resolution:** Change `as Record<string, ProvenanceEntry>` → `as unknown as Record<string, ProvenanceEntry>` at both lines
- **Impact:** Two-line fix in integration test; no logic change

## Definition of Done
- [ ] `syncFundamentals()` implemented; V1 proxy fields documented (BC-020-003)
- [ ] `POST /api/cron/fundamentals` endpoint with OIDC auth implemented
- [ ] Cloud Scheduler Mon–Fri 6pm ET job configured
- [ ] 9 service unit tests passing (7 existing + 2 added: inUniverse filter + provenance-absent)
- [ ] 2 route unit tests passing (new file: `tests/unit/api/cron/fundamentals.test.ts`)
- [ ] 4 integration tests passing against real test DB (ticker fix applied: BC-020-001)
- [ ] Regression coverage: null-not-overwrite, provenance-per-field, partial-field coverage, fallback_count
- [ ] 7 baseline conflicts documented (BC-020-001 through BC-020-007)
- [ ] Traceability comments referencing EPIC-003, STORY-020, RFC-001, RFC-004, ADR-001, ADR-002
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- PRD: Section 15 (Data Requirements — fundamentals fields), Section 16 (90-day stale threshold)
- RFC: RFC-001 §FundamentalFields (canonical field list), RFC-002 (stocks table schema), RFC-004 §Fundamentals Sync
- ADR: ADR-001 (Tiingo primary for fundamentals), ADR-002 (daily 6pm ET slot), ADR-008 (Cloud Scheduler)
