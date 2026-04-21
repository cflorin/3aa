# STORY-016: Tiingo Provider Adapter

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Status:** done ✅
**Dependencies:** STORY-015 (VendorAdapter interface and canonical types)
**Estimated Complexity:** Medium
**Completed:** 2026-04-20

---

## Story Overview

Implement `TiingoAdapter` — the Tiingo concrete implementation of `VendorAdapter`. Tiingo is the primary source for EOD prices and fundamentals. Forward estimates are NOT available from Tiingo at this API tier (endpoint returns 404); the adapter declares `forwardEstimateCoverage: 'none'` and `fetchForwardEstimates` always returns null.

**⚠ Baseline Conflicts (flagged — do not proceed silently):**

| Conflict | RFC/ADR Assumption | Reality (verified 2026-04-20) |
|---|---|---|
| Forward estimates | RFC-004/ADR-001: Tiingo has ~60% forward estimate coverage; used as fallback | `/tiingo/fundamentals/{ticker}/overview` returns 404; no forward estimates available at this API tier |
| Market cap in universe | RFC-004: `fetchUniverse(minMarketCapMillions)` filters by market cap at adapter level | `/tiingo/fundamentals/meta` returns sector/industry/name but no `marketCap` field; threshold cannot be applied |

These conflicts are documented here. Implementation proceeds with `forwardEstimateCoverage: 'none'` and `market_cap_millions: null` from Tiingo. Stories that depend on these (STORY-021 forward estimates, STORY-018 universe sync) must be updated accordingly.

---

## Real API Reference (verified with live key)

| Method | Endpoint | Response Shape |
|---|---|---|
| `fetchUniverse` | `GET /tiingo/fundamentals/meta` | `Array<{ticker, name, sector, industry, location, isActive, isADR, ...}>` — no marketCap |
| `fetchEODPrice` | `GET /tiingo/daily/{ticker}/prices` | `Array<{close, date, adjClose, high, low, open, volume, ...}>` |
| `fetchFundamentals` | `GET /tiingo/fundamentals/{ticker}/statements` | `Array<{date, year, quarter, statementData: {incomeStatement, balanceSheet, overview, cashFlow}}>` — each section is `Array<{dataCode, value}>` |
| `fetchForwardEstimates` | n/a — endpoint 404 | Always returns `null` |
| `fetchMetadata` | `GET /tiingo/daily/{ticker}` | `{ticker, name, description, startDate, endDate, exchangeCode}` |

### Verified Tiingo field → canonical field mapping

**Income statement `dataCode`s (per quarter; need 4 for TTM):**
`revenue`, `netinc`, `grossProfit`, `ebit`, `intexp`, `eps`, `epsDil`, `opex`, `ebitda`, `costRev`

**Balance sheet `dataCode`s (latest quarter):**
`equity`, `totalAssets`, `debt`, `assetsCurrent`, `liabilitiesCurrent`, `debtCurrent`, `debtNonCurrent`

**Overview `dataCode`s (latest quarter, pre-computed):**
`grossMargin`, `profitMargin`, `roe`, `roa`, `currentRatio`, `debtEquity`, `longTermDebtEquity`, `rps`, `revenueQoQ`, `epsQoQ`, `bvps`, `piotroskiFScore`

**Canonical FundamentalData field mapping:**

| Canonical field | Source | Notes |
|---|---|---|
| `revenue_ttm` | sum(last 4 quarters `revenue`) | — |
| `earnings_ttm` | sum(last 4 quarters `netinc`) | — |
| `revenue_growth_yoy` | (TTM − prior TTM) / \|prior TTM\| × 100 | null if < 8 quarters |
| `eps_growth_yoy` | (TTM `eps` − prior TTM `eps`) / \|prior TTM\| × 100 | null if < 8 quarters |
| `eps_growth_fwd` | always `null` | set by estimates sync |
| `gross_margin` | overview `grossMargin` (latest quarter) | pre-computed |
| `operating_margin` | `ebit / revenue` from latest income statement | compute if revenue ≠ 0 |
| `net_margin` | overview `profitMargin` (latest quarter) | pre-computed |
| `roe` | overview `roe` | pre-computed |
| `roa` | overview `roa` | pre-computed |
| `roic` | `earnings_ttm / (equity + debt)` from latest balance sheet | compute; null if denominator = 0 |
| `trailing_pe` | **NOT available** | Tiingo fundamentals has no P/E; always `null` |
| `debt_to_equity` | overview `debtEquity` | pre-computed |
| `current_ratio` | overview `currentRatio` | pre-computed |
| `interest_coverage` | `ebit / intexp` from latest income statement | null if `intexp` = 0 or absent |

---

## Acceptance Criteria

1. `TiingoAdapter` satisfies `implements VendorAdapter` at TypeScript compile time
2. `providerName === 'tiingo'`; `capabilities.forwardEstimateCoverage === 'none'`; `capabilities.rateLimit.requestsPerHour === 1000`
3. Constructor throws `ConfigurationError` if `TIINGO_API_KEY` missing or empty string
4. Rate limiter throws `RateLimitExceededError` on the 1,001st request within one rolling hour
5. 401/403 → `AuthenticationError`; 5xx → `HttpStatusError`; 404 → `null`; API key never appears in logs
6. `fetchUniverse` calls `/tiingo/fundamentals/meta`; returns active US stocks (`isActive=true`, `location` ends with `, USA`); `market_cap_millions` is always `null` (not available from this endpoint); `sector`/`industry` populated from meta response
7. `fetchEODPrice` returns `PriceData` with last element of array; `null` on empty array or 404
8. `fetchFundamentals` returns all 15 canonical fields; `trailing_pe` and `eps_growth_fwd` are always `null`; response correctly parsed from `{dataCode, value}[]` array format
9. `fetchForwardEstimates` always returns `null` (`forwardEstimateCoverage: 'none'`)
10. `fetchMetadata` returns `StockMetadata` with `ticker`, `company_name`, `exchange`; `sector`/`industry` are `null` (not available from `/tiingo/daily/{ticker}`)
11. Integration tests gated on `TIINGO_API_KEY`; skipped if absent

---

## Task Breakdown

### TASK-016-001: Custom Error Types + Adapter Skeleton + Rate Limiter ✅

**Description:** Create the three shared error classes and the `TiingoAdapter` class skeleton including the sliding-window rate limiter and `tiingoFetch` shared HTTP helper.

**Acceptance Criteria:**
- `src/modules/data-ingestion/errors.ts` exports `RateLimitExceededError(provider, resetInMs?)`, `ConfigurationError(message)`, `AuthenticationError(provider, status)` — each with correct `name` property
- `TiingoAdapter implements VendorAdapter` at compile time
- Constructor: reads `process.env.TIINGO_API_KEY`; parameter overrides env var (for test injection); throws `ConfigurationError` if missing or empty
- `providerName = 'tiingo'`; `capabilities.forwardEstimateCoverage = 'none'`; `capabilities.rateLimit.requestsPerHour = 1000`
- `enforceRateLimit()`: sliding window using `Date.now()` timestamps; filter to `> now - 3_600_000`; throw `RateLimitExceededError` when `>= 1000` in window
- `tiingoFetch(path)`: calls `enforceRateLimit()`; `Authorization: Token {key}` header; logs `{ event: 'tiingo_request', path }` (path only — key never logged); 401/403 → `AuthenticationError`; 404 → `null`; non-2xx → `HttpStatusError`; returns `response.json()`
- Stub `throw new Error('not implemented')` bodies for five `VendorAdapter` methods
- **RFC-004 deviation noted:** RFC specifies logging response status per request; implementation logs request path only (pre-fetch). Accepted for V1.

**Files Created:**
- `src/modules/data-ingestion/errors.ts`
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts`

---

### TASK-016-002: `fetchUniverse` + `fetchMetadata`

**Description:** Implement `fetchUniverse` using the verified `/tiingo/fundamentals/meta` endpoint and `fetchMetadata` using `/tiingo/daily/{ticker}`.

**Acceptance Criteria:**
- `fetchUniverse(minMarketCapMillions)`:
  - Calls `GET /tiingo/fundamentals/meta`
  - Filters: `isActive === true` AND `location` ends with `', USA'`
  - `minMarketCapMillions` parameter accepted but **not applied** (no market cap in response) — this is the documented baseline conflict
  - Returns `UniverseStock[]` with: `ticker`, `company_name = name`, `exchange = ''` (not available from meta), `market_cap_millions = null`, `country = 'US'`, `sector` (from meta, null if absent), `industry` (from meta, null if absent)
  - On non-array response: log error, return `[]`
  - Structured log after fetch: `{ event: 'tiingo_universe_fetched', total_raw, qualifying }`
- `fetchMetadata(ticker)`:
  - Calls `GET /tiingo/daily/{ticker}`
  - Returns `StockMetadata` with: `ticker`, `company_name = name`, `exchange = exchangeCode`, `sector: null`, `industry: null`, `market_cap_millions: null`
  - Returns `null` on 404

**Files Modified:**
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — `fetchUniverse()`, `fetchMetadata()` replacing stubs

**Note:** `UniverseStock.market_cap_millions` must be typed as `number | null` in `src/modules/data-ingestion/types.ts`. Verify and update STORY-015 output if needed.

---

### TASK-016-003: `fetchEODPrice`

**Description:** Implement `fetchEODPrice` using the verified `/tiingo/daily/{ticker}/prices` endpoint.

**Acceptance Criteria:**
- Calls `GET /tiingo/daily/{ticker}/prices` (with optional `?startDate=&endDate=` when `date` provided)
- Returns last array element (`raw[raw.length - 1]`) as most recent
- `PriceData`: `{ ticker, date: new Date(record.date), close: Number(record.close) }`
- Returns `null` on: empty array, non-array body, 404
- Returns `null` if `close` is NaN

**Files Modified:**
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — `fetchEODPrice()` replacing stub

---

### TASK-016-004: `fetchFundamentals` + `fetchForwardEstimates`

**Description:** Implement `fetchFundamentals` with the correct response structure (array of quarterly statements, each section as `{dataCode, value}[]`). Implement `fetchForwardEstimates` as a stub that always returns `null`.

**Acceptance Criteria — `fetchFundamentals`:**
- Calls `GET /tiingo/fundamentals/{ticker}/statements`
- Returns `null` on 404 or empty array
- Response is `Array<{date, year, quarter, statementData: {incomeStatement, balanceSheet, overview}}>` — parse using `Object.fromEntries(section.map(x => [x.dataCode, x.value]))`
- TTM = last 4 quarterly entries (index `[-4:]` from end); YoY = entries `[-8:-4]`
- All 15 canonical fields populated (see field mapping table above); `trailing_pe: null`; `eps_growth_fwd: null`
- Use overview pre-computed values (`grossMargin`, `profitMargin`, `roe`, `roa`, `currentRatio`, `debtEquity`) from latest quarter
- Compute `operating_margin = ebit / revenue`; `roic = earnings_ttm / (equity + debt)`; `interest_coverage = ebit / intexp`; all null if denominator is 0 or field absent

**Acceptance Criteria — `fetchForwardEstimates`:**
- Always returns `null` — no endpoint available at this API tier
- Logs `{ event: 'tiingo_forward_estimates_unavailable', ticker }` at debug level

**Files Modified:**
- `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — `fetchFundamentals()`, `fetchForwardEstimates()` replacing stubs

---

### TASK-016-005: Unit Tests

**Description:** 30 unit tests covering all methods and invariants. All HTTP mocked — no live calls.

**Test list:**

Constructor (3): undefined key → `ConfigurationError`; empty string → `ConfigurationError`; valid key → no throw

Capabilities (3): `providerName='tiingo'`; `forwardEstimateCoverage='none'`; `rateLimit.requestsPerHour=1000`

Rate limiter (1): 1,000 calls succeed; 1,001st throws `RateLimitExceededError`

HTTP errors (4): 401 → `AuthenticationError`; 403 → `AuthenticationError`; 500 → `HttpStatusError`; 404 → `null`

Log safety (1): API key value absent from all `console.log` output

`fetchUniverse` (4): active US stocks returned; non-US and inactive excluded; non-array body → `[]`; sector/industry null when absent

`fetchEODPrice` (3): valid `PriceData`; last element selected; empty array → `null`

`fetchFundamentals` (5): correct TTM aggregation (asserted known sum); overview fields used for margins; roic computed; `trailing_pe` always null; `eps_growth_fwd` always null

`fetchForwardEstimates` (2): returns `null`; does not throw

`fetchMetadata` (2): valid `StockMetadata` with `sector: null`, `industry: null`; 404 → `null`

**Mock pattern:** `global.fetch = jest.fn().mockResolvedValue({ ok, status, statusText, json })` in `beforeEach`; `jest.restoreAllMocks()` in `afterEach`

**Files Created:**
- `tests/unit/data-ingestion/tiingo.adapter.test.ts` — 30 tests

**Definition of Done:** `npx jest tests/unit/data-ingestion/tiingo.adapter.test.ts` exits 0 with 30 passing

---

### TASK-016-006: Integration Tests + Tracking

**Description:** Integration tests against live Tiingo API; gated on `TIINGO_API_KEY`. Update log and plan.

**5 integration tests (all inside `describeOrSkip`):**
1. `fetchUniverse()` returns > 1000 active US stocks; each has `ticker`, `company_name` non-empty; `market_cap_millions` is `null`; `country === 'US'`
2. `fetchEODPrice('AAPL')` returns `PriceData` with `close > 0`; `date` is a `Date`
3. `fetchFundamentals('AAPL')` returns non-null; `revenue_ttm` non-null; `roe` non-null; `trailing_pe` is null
4. `fetchForwardEstimates('AAPL')` returns `null` (confirmed unavailable at this tier)
5. `fetchMetadata('AAPL')` returns `{ ticker: 'AAPL', company_name: 'Apple Inc', exchangeCode: 'NASDAQ' }`

**Gate:** `const describeOrSkip = process.env.TIINGO_API_KEY ? describe : describe.skip`
**Timeouts:** 30s for `fetchUniverse`; 15s for all others

**Tracking updates:**
- `docs/architecture/IMPLEMENTATION-LOG.md` — STORY-016 entry
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-016 status → `done ✅`

**Files Created:**
- `tests/integration/data-ingestion/tiingo.adapter.test.ts`

**Files Modified:**
- `docs/architecture/IMPLEMENTATION-LOG.md`
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md`

---

## Summary

**Total Tasks:** 6
**Status:** ready — implementation not started

**Known constraints going into implementation:**
- `market_cap_millions` always `null` from Tiingo — market cap filter applied at sync layer only
- `trailing_pe` always `null` from Tiingo fundamentals — not available at this API tier
- Forward estimates not available from Tiingo at this API tier — `forwardEstimateCoverage: 'none'`; `fetchForwardEstimates` always returns `null`

---

## Traceability

**PRD Reference:** Section 15 (Data Requirements)
**RFC Reference:** RFC-004 §TiingoAdapter, §Provider Abstraction Layer
**ADR References:**
- ADR-001 (Multi-Provider Data Architecture) — **CONFLICT noted above**
- ADR-009 (Modular Monolith)
- ADR-010 (TypeScript)

---

**Created:** 2026-04-20
**Last Updated:** 2026-04-20
