# STORY-059 — `TiingoAdapter.fetchQuarterlyStatements` Method

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Status
ready

## Purpose
Add `fetchQuarterlyStatements(ticker)` to `TiingoAdapter` — a new method that returns the raw `QuarterlyReport[]` from the existing `/tiingo/fundamentals/{ticker}/statements` endpoint without aggregation. This reuses the same API endpoint and authentication as `fetchFundamentals` and requires no new API tier or plan upgrade.

## Story
As the **quarterly history sync service**,
I want **`TiingoAdapter.fetchQuarterlyStatements(ticker)` to return raw quarterly rows sorted newest-first**,
so that **the sync service can persist individual quarter data without the TTM aggregation that `fetchFundamentals` performs**.

## Outcome
- `TiingoAdapter.fetchQuarterlyStatements(ticker)` returns `QuarterlyReport[] | null`
- Returns newest-first array of quarterly rows (fiscal quarter ≠ 0 only — same filter as `fetchFundamentals`)
- Returns `null` on 404 or empty response
- Method is NOT added to the `VendorAdapter` interface — it is `TiingoAdapter`-specific (Tiingo-only for quarterly history in V1)
- Reuses existing `tiingoFetch()` transport, rate-limit enforcement, and auth; no new HTTP infrastructure
- Structured logging: one `tiingo_quarterly_statements_fetched` event with `{ ticker, count }` per successful call

## Scope In
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — new method `fetchQuarterlyStatements`
- Uses existing `/tiingo/fundamentals/${encodeURIComponent(ticker)}/statements` endpoint (same as `fetchFundamentals`)
- Filters `quarter !== 0` (same as existing `fetchFundamentals` filter to exclude annual summaries)
- Returns raw `QuarterlyReport[]` — no aggregation, no DataCode map construction
- Unit tests: adapter method tested in isolation with mocked `tiingoFetch`

## Scope Out
- Persisting quarterly data to `stock_quarterly_history` (STORY-060)
- Derived metric computation (STORY-061, STORY-062)
- Any change to `VendorAdapter` interface or `ProviderOrchestrator`

## Dependencies
- **Epic:** EPIC-003
- **RFCs:** RFC-004 Amendment 2026-04-25 (`fetchQuarterlyStatements` spec), RFC-008 §Provider Decision
- **ADRs:** ADR-001 Amendment 2026-04-25 (Tiingo primary for quarterly history; NOT in VendorAdapter interface)
- **Upstream:** STORY-016 (`TiingoAdapter` and `tiingoFetch` established)

## Preconditions
- `TiingoAdapter` class exists with `tiingoFetch` transport method
- `QuarterlyReport` type already defined in the adapter file

## Inputs
- `ticker: string`
- Tiingo API key (env var, same as existing)
- Response from `/tiingo/fundamentals/{ticker}/statements` (array of quarterly + annual entries)

## Outputs
- `QuarterlyReport[] | null` — filtered to quarter ≠ 0 only, sorted newest-first as returned by Tiingo
- `null` when ticker not found or Tiingo returns empty
- Log event `tiingo_quarterly_statements_fetched` with count

## Acceptance Criteria
- [ ] `fetchQuarterlyStatements(ticker)` returns `QuarterlyReport[]` filtered to `quarter !== 0`
- [ ] Returns `null` when Tiingo returns 404 or empty array
- [ ] Annual summary rows (`quarter === 0`) are excluded from the returned array
- [ ] Method does NOT appear in the `VendorAdapter` interface
- [ ] Existing `fetchFundamentals` behavior is unchanged (no regression)
- [ ] Rate limit enforcement applies (same as all other Tiingo calls)
- [ ] Unit tests cover: successful response, 404 response, empty array, annual-row filtering

## Traceability
- Epic: EPIC-003 — Data Ingestion & Universe Management
- RFC: RFC-004 Amendment 2026-04-25, RFC-008 §Provider Decision, RFC-008 §New Adapter Method
- ADR: ADR-001 Amendment 2026-04-25
