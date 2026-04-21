# STORY-017: FMP Provider Adapter

**Epic:** EPIC-003 — Data Ingestion & Universe Management
**Status:** done ✅
**Completed:** 2026-04-20
**Dependencies:** STORY-015 (VendorAdapter interface and canonical types)
**Estimated Complexity:** Medium

---

## Story Overview

Implement `FMPAdapter` — the FMP concrete implementation of `VendorAdapter`. FMP is the primary source for forward estimates and serves as fallback for prices and fundamentals.

**⚠ Baseline Conflicts (flagged — do not proceed silently):**

| Conflict | RFC/ADR Assumption | Reality (verified 2026-04-20) |
|---|---|---|
| API base URL | RFC-004 uses `https://financialmodelingprep.com/api/v3` | v3 fully deprecated; all endpoints return 403. Working base: `https://financialmodelingprep.com/stable` |
| `fetchUniverse` | RFC-004: FMP can filter universe by market cap and exchange via screener | Screener endpoint returns 402 (plan restriction). No list/symbol endpoint available. `fetchUniverse` returns `[]` with a structured warning; universe sourced from Tiingo |
| `forwardEstimateCoverage` | ADR-001, RFC-004: FMP ~85% coverage → declare `'full'` | On this plan, small/mid caps return 402 for analyst-estimates. Coverage not 'full'. Declaring `'partial'` until plan is upgraded. STORY-021 must account for this |
| Analyst estimate field names | Speculative: `estimatedEpsAvg`, `estimatedEbitAvg` | Actual: `epsAvg`, `ebitAvg` |
| EOD price response shape | Speculative: `{historical: [{close, adjClose, ...}]}` nested object | Actual: flat array `[{symbol, date, open, high, low, close, volume, changePercent, vwap}]` — no nested key, no `adjClose` |
| `forward_pe` / `forward_ev_ebit` semantics | Type names imply P/E and EV/EBIT ratios | FMP provides raw estimates: `epsAvg` = EPS forecast ($), `ebitAvg` = EBIT forecast (full $). Ratios require price/EV — not computable here. Adapter stores raw values; STORY-021 must clarify downstream ratio computation |

---

## Real API Reference (verified with live key 2026-04-20)

**Base URL:** `https://financialmodelingprep.com/stable`  
**Auth:** `?apikey={key}` query param (NOT Authorization header)

| Method | Endpoint | Response Shape |
|---|---|---|
| `fetchMetadata` | `GET /stable/profile?symbol={ticker}` | `[{symbol, companyName, exchange, sector, industry, country, marketCap, isActivelyTrading, ...}]` — array with one item |
| `fetchEODPrice` | `GET /stable/historical-price-eod/full?symbol={ticker}&limit=N` | Flat array sorted **descending**: `[{symbol, date, open, high, low, close, volume, changePercent, vwap}]` — no nested key, no adjClose |
| `fetchFundamentals` | `GET /stable/income-statement?symbol={ticker}&period=annual&limit=2` | `[{date, symbol, revenue, netIncome, grossProfit, operatingIncome, ebit, interestExpense, epsDiluted, ...}]` sorted descending |
| `fetchFundamentals` | `GET /stable/balance-sheet-statement?symbol={ticker}&period=annual&limit=2` | `[{date, symbol, totalStockholdersEquity, totalDebt, totalCurrentAssets, totalCurrentLiabilities, totalAssets, ...}]` sorted descending |
| `fetchForwardEstimates` | `GET /stable/analyst-estimates?symbol={ticker}&period=annual` | `[{symbol, date, epsAvg, epsHigh, epsLow, ebitAvg, revenueAvg, numAnalystsEps, numAnalystsRevenue, ...}]` sorted **descending** by date (future years first) |
| `fetchUniverse` | n/a — screener endpoint returns 402 | Always returns `[]` |

### Verified canonical field mapping

**`fetchFundamentals` — from income statement (latest annual, index 0):**

| Canonical field | FMP field | Notes |
|---|---|---|
| `revenue_ttm` | `revenue / 1_000_000` | Annual FY as TTM proxy; in millions |
| `earnings_ttm` | `netIncome / 1_000_000` | In millions |
| `revenue_growth_yoy` | `(revenue[0] − revenue[1]) / |revenue[1]| × 100` | null if < 2 annual entries |
| `eps_growth_yoy` | `(epsDiluted[0] − epsDiluted[1]) / |epsDiluted[1]| × 100` | Use `epsDiluted` NOT netIncome |
| `eps_growth_fwd` | — | Always null (set by estimates sync) |
| `gross_margin` | `grossProfit / revenue` | null if revenue = 0 |
| `operating_margin` | `operatingIncome / revenue` | null if revenue = 0 |
| `net_margin` | `netIncome / revenue` | null if revenue = 0 |
| `interest_coverage` | `ebit / interestExpense` | null if interestExpense = 0 or absent |
| `trailing_pe` | — | Always null |

**`fetchFundamentals` — from balance sheet (latest annual, index 0):**

| Canonical field | FMP field | Notes |
|---|---|---|
| `roe` | `netIncome / totalStockholdersEquity` | null if equity = 0 |
| `roa` | `netIncome / totalAssets` | null if assets = 0 |
| `roic` | `netIncome / (totalStockholdersEquity + totalDebt)` | null if denom = 0 |
| `debt_to_equity` | `totalDebt / totalStockholdersEquity` | null if equity = 0 |
| `current_ratio` | `totalCurrentAssets / totalCurrentLiabilities` | null if liabilities = 0 |

**`fetchForwardEstimates` — NTM selection from analyst-estimates:**
- Array sorted descending by date. Sort ascending, find first entry with `date > today` → NTM entry. Fallback: last (most recent) entry if all past.
- `forward_pe` ← `entry.epsAvg` (raw EPS estimate, $; valuation engine computes P/E = price/epsAvg)
- `forward_ev_ebit` ← `entry.ebitAvg / 1_000_000` (EBIT estimate in millions; EV/EBIT ratio computed by valuation engine)

---

## Acceptance Criteria

1. `FMPAdapter` satisfies `implements VendorAdapter` at TypeScript compile time
2. `providerName === 'fmp'`; `capabilities.forwardEstimateCoverage === 'partial'`; `capabilities.rateLimit.requestsPerHour === 15000`
3. Constructor throws `ConfigurationError` if `FMP_API_KEY` missing or empty string
4. Rate limiter throws `RateLimitExceededError` on the 251st request within one rolling minute (60-second window)
5. 401/403 → `AuthenticationError`; 5xx → `HttpStatusError`; 404 → `null`; 402 → `null` (plan restriction, not a crash); API key never appears in logs
6. `fetchUniverse` makes no HTTP call; returns `[]`; logs `{ event: 'fmp_universe_unavailable', reason: 'screener_not_available_on_plan' }`
7. `fetchMetadata` calls `/stable/profile?symbol={ticker}`; returns `StockMetadata` with all 6 fields; `market_cap_millions = marketCap / 1_000_000`; returns `null` on 404/empty
8. `fetchEODPrice` calls `/stable/historical-price-eod/full?symbol={ticker}`; reads flat array (NOT nested `historical` key); returns first element as most recent; returns `null` on empty array or 404
9. `fetchFundamentals` makes two parallel calls; merges all 15 canonical fields; `trailing_pe` and `eps_growth_fwd` always null; `eps_growth_yoy` uses `epsDiluted`; revenue/earnings in millions; returns `null` if income statement empty
10. `fetchForwardEstimates` selects NTM entry (first future fiscal year end); stores `epsAvg` → `forward_pe`, `ebitAvg/1M` → `forward_ev_ebit`; returns `null` on 402/empty/both-fields-null
11. Integration tests gated on `FMP_API_KEY`; skipped if absent

---

## Task Breakdown

### TASK-017-001: Adapter Skeleton + Rate Limiter + `fmpFetch` Helper

**Description:** Full rewrite of `fmp.adapter.ts` — discard speculative v3 code. Establish the correct stable base URL, constructor, sliding-window rate limiter (250 req/min), and shared HTTP helper. Five VendorAdapter method stubs.

**Acceptance Criteria:**
- `FMP_BASE_URL = 'https://financialmodelingprep.com/stable'`
- Constructor: reads `process.env.FMP_API_KEY`; parameter overrides; throws `ConfigurationError` if missing or empty
- `providerName = 'fmp'`; `capabilities.forwardEstimateCoverage = 'partial'`; `capabilities.rateLimit.requestsPerHour = 15_000`
- `enforceRateLimit()`: sliding window over `requestTimestamps: number[]`; filter `> now - 60_000`; throw `RateLimitExceededError('fmp', resetInMs)` at `>= 250`; push `now` after passing
- `fmpFetch(path)`: appends `?apikey={key}` query param (NOT Authorization header); logs `{ event: 'fmp_request', path }` (path only — key never logged); 401/403 → `AuthenticationError`; 402 → logs `{ event: 'fmp_plan_restriction', path }` and returns `null`; 404 → `null`; non-2xx → `HttpStatusError`; returns `response.json()`
- Five stub methods: `throw new Error('not implemented')`

**Files Modified:**
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — FULL REWRITE (discard speculative v3 code)

---

### TASK-017-002: `fetchMetadata` + `fetchEODPrice`

**Description:** Implement the two simpler per-ticker methods using verified stable endpoints.

**Acceptance Criteria:**
- `fetchMetadata(ticker)`:
  - Calls `GET /stable/profile?symbol={ticker}`
  - Response is array with one item; returns `null` if null from fmpFetch or array empty
  - Returns `StockMetadata`: `ticker=symbol`, `company_name=companyName`, `exchange=exchange`, `sector` (null if absent), `industry` (null if absent), `market_cap_millions = marketCap / 1_000_000`
- `fetchEODPrice(ticker, date?)`:
  - Calls `GET /stable/historical-price-eod/full?symbol={ticker}` (with `&from=&to=` if date provided)
  - Response is **flat array** sorted descending — reads `raw[0]` directly (no `raw.historical`)
  - Returns `{ ticker, date: new Date(record.date), close: Number(record.close) }`
  - Returns `null` if: fmpFetch null, empty array, NaN close

**Files Modified:**
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — `fetchMetadata()`, `fetchEODPrice()` replacing stubs

---

### TASK-017-003: `fetchFundamentals`

**Description:** Two parallel calls to income statement and balance sheet; merge into all 15 canonical `FundamentalData` fields.

**Acceptance Criteria:**
- Two parallel `fmpFetch` calls: income `period=annual&limit=2`, balance `period=annual&limit=2`
- Returns `null` if income statement empty or null
- All 15 canonical fields populated per the verified mapping table above
- `eps_growth_yoy` uses `epsDiluted` (not `netIncome` — share count changes distort the latter)
- `revenue_ttm` and `earnings_ttm` in millions (÷ 1_000_000); all ratios dimensionless
- `trailing_pe` always `null`; `eps_growth_fwd` always `null`
- All ratio fields: `null` if denominator is 0 or field absent

**Files Modified:**
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — `fetchFundamentals()` replacing stub

---

### TASK-017-004: `fetchForwardEstimates` + `fetchUniverse`

**Description:** Implement `fetchForwardEstimates` with NTM selection. Implement `fetchUniverse` as a no-op (screener not available on this plan).

**Acceptance Criteria — `fetchForwardEstimates`:**
- Calls `GET /stable/analyst-estimates?symbol={ticker}&period=annual`
- Returns `null` on: fmpFetch null (including 402), empty array
- NTM selection: sort entries ascending by date; find first entry with `new Date(entry.date) > new Date()`; fallback to last entry if all in past
- Returns `{ ticker, forward_pe: entry.epsAvg ?? null, forward_ev_ebit: entry.ebitAvg != null ? entry.ebitAvg / 1_000_000 : null }`
- Returns `null` if both `forward_pe` and `forward_ev_ebit` are null after normalization
- Logs `{ event: 'fmp_forward_estimates_fetched', ticker, ntm_date: entry.date, num_analysts: entry.numAnalystsEps }`

**Acceptance Criteria — `fetchUniverse`:**
- Makes **no HTTP call**
- Logs `{ event: 'fmp_universe_unavailable', reason: 'screener_not_available_on_plan' }` at warn level
- Returns `[]`

**Files Modified:**
- `src/modules/data-ingestion/adapters/fmp.adapter.ts` — `fetchForwardEstimates()`, `fetchUniverse()` replacing stubs

---

### TASK-017-005: Unit Tests

**Description:** 30 unit tests covering all methods and invariants. All HTTP mocked — no live calls.

**Test list:**

Constructor (3): undefined key → ConfigurationError; empty string → ConfigurationError; valid key → no throw

Capabilities (3): `providerName='fmp'`; `forwardEstimateCoverage='partial'`; `rateLimit.requestsPerHour=15000`

Rate limiter (2): [test 1] 250 calls succeed and 251st throws `RateLimitExceededError`; [test 2] after advancing fake clock 60,001ms past the first request, the 251st request succeeds (window reset)

HTTP errors (5): 401 → AuthenticationError; 403 → AuthenticationError; 402 → null returned (not thrown); 500 → HttpStatusError; 404 → null

Log safety (1): API key value absent from all `console.log` output

`fetchUniverse` (2): returns `[]`; makes no HTTP call (`global.fetch` not called)

`fetchMetadata` (4): valid StockMetadata; `market_cap_millions` = `mockMarketCap / 1_000_000` (fixture: `marketCap: 5_000_000_000` → `market_cap_millions: 5_000`); 404 → null; empty array → null

`fetchEODPrice` (3): valid PriceData from flat array `raw[0]`; empty array → null; NaN close → null

`fetchFundamentals` (6): full FundamentalData all 15 fields; `eps_growth_yoy` uses `epsDiluted` (fixture with share-count change verifies result differs from netIncome-based calc); `revenue_ttm` in millions (÷1M); `trailing_pe` null; empty income → null; **balance sheet null while income valid → returns partial FundamentalData with all 5 balance-sheet-derived fields null (roe, roa, roic, debt_to_equity, current_ratio) but income-derived fields populated**

`fetchForwardEstimates` (5): NTM entry correctly selected (fixture with past and future dates — first future date after today selected); 402 → null; empty array → null; both fields null after normalization → null; `ebitAvg` unit magnitude verified (`ebitAvg: 210_000_000_000` → `forward_ev_ebit: 210_000`)

**Mock pattern:** `global.fetch = jest.fn().mockResolvedValue({ ok, status, statusText, json })` in `beforeEach`; `jest.restoreAllMocks()` in `afterEach`; `jest.useFakeTimers()` / `jest.useRealTimers()` for rate limiter window reset test

**Files Created:**
- `tests/unit/data-ingestion/fmp.adapter.test.ts` — 34 tests

**Definition of Done:** `npx jest tests/unit/data-ingestion/fmp.adapter.test.ts` exits 0 with 34 passing

---

### TASK-017-006: Integration Tests + Tracking

**Description:** Integration tests against live FMP stable API; gated on `FMP_API_KEY`. Update log and plan.

**4 integration tests (all inside `describeOrSkip`):**
1. `fetchMetadata('AAPL')` → non-null; `ticker='AAPL'`; `company_name` contains 'Apple'; `exchange='NASDAQ'`; `market_cap_millions > 0`; `sector` non-null
2. `fetchEODPrice('AAPL')` → non-null; `close > 0`; `date` is a `Date` instance
3. `fetchFundamentals('AAPL')` → non-null; `revenue_ttm > 0`; `gross_margin > 0`; `trailing_pe === null`; `eps_growth_fwd === null`
4. `fetchForwardEstimates('AAPL')` → non-null; `forward_pe > 0`; `forward_ev_ebit > 0`

**Note:** `fetchUniverse` integration test omitted — it is a no-op; unit test covers it fully.

**Gate:** `const describeOrSkip = process.env.FMP_API_KEY ? describe : describe.skip`
**Timeouts:** 15s for all tests
**Fixture provenance:** `captured_real — assertions based on live FMP stable API responses verified 2026-04-20`

**Tracking updates:**
- `docs/architecture/IMPLEMENTATION-LOG.md` — STORY-017 entry
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md` — STORY-017 status → `done ✅` with correct evidence

**Files Created:**
- `tests/integration/data-ingestion/fmp.adapter.test.ts`

**Files Modified:**
- `docs/architecture/IMPLEMENTATION-LOG.md`
- `docs/architecture/IMPLEMENTATION-PLAN-V1.md`

---

## Summary

**Total Tasks:** 6
**Status:** done ✅ — implementation complete, all tests passing

**Known constraints going into implementation:**
- `fetchUniverse` always returns `[]` — screener blocked on this plan; universe sourced from Tiingo
- `forwardEstimateCoverage: 'partial'` — small/mid caps return 402; STORY-021 must not assume full FMP coverage
- `forward_pe` stores raw EPS estimate (not P/E ratio); `forward_ev_ebit` stores EBIT estimate in millions (not ratio) — valuation engine computes ratios
- All v3 FMP endpoints deprecated; must use `https://financialmodelingprep.com/stable`
- EOD price response is a flat array (no `historical` nested key)
- Analyst estimates field names: `epsAvg`, `ebitAvg` (not `estimatedEpsAvg`, `estimatedEbitAvg`)

---

## Traceability

**PRD Reference:** Section 15 (Data Requirements)
**RFC Reference:** RFC-004 §FMPAdapter, §Forward Estimates Sync
**ADR References:**
- ADR-001 (Multi-Provider Data Architecture) — **CONFLICTS noted above**
- ADR-009 (Modular Monolith)
- ADR-010 (TypeScript)

---

**Created:** 2026-04-20 (speculative)
**Rewritten:** 2026-04-20 (real API verified)
