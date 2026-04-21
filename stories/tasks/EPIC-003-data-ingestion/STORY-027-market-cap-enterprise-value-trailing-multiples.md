# STORY-027 — Market Cap, Enterprise Value & Trailing Valuation Multiples

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Populate `market_cap`, compute Enterprise Value (EV), and derive trailing valuation multiples (`trailing_pe`, `trailing_ev_ebit`, `ev_sales`) that are currently null in the stocks table. These are direct inputs into EPIC-004 classification scoring and EPIC-005 valuation engine. Without them, the pipeline produces no actionable valuation data.

## Story
As a **developer**,
I want **market cap fetched from FMP profile, TTM absolute values stored, and trailing P/E, EV/EBIT, EV/Sales computed and stored** —
so that **classification and valuation engines have correct, current trailing multiples rather than null fields**.

## Outcome
- `market_cap` populated from FMP `/profile` endpoint (in USD)
- `shares_outstanding` populated from FMP profile (diluted shares, needed for EPS per share)
- `eps_ttm` stored as TTM EPS per diluted share (= earnings_ttm / shares_outstanding)
- `earnings_ttm`, `revenue_ttm`, `ebit_ttm` stored as absolute TTM values in USD (intermediate inputs, not ratios)
- `trailing_pe` = `current_price / eps_ttm` (null if eps_ttm ≤ 0)
- `trailing_ev_ebit` = `(market_cap + total_debt − cash_and_equivalents) / ebit_ttm` (null if ebit_ttm ≤ 0)
- `ev_sales` = `(market_cap + total_debt − cash_and_equivalents) / revenue_ttm` (null if revenue_ttm = 0)
- Schema migration adds 5 new columns: `earnings_ttm`, `revenue_ttm`, `ebit_ttm`, `shares_outstanding`, `eps_ttm`

## Scope In

### Task 1 — Schema migration: add absolute TTM and shares columns
Add to Prisma schema and migrate:
```
earningsTtm        Decimal? @db.Decimal(20, 2) @map("earnings_ttm")     -- TTM net income in USD
revenueTtm         Decimal? @db.Decimal(20, 2) @map("revenue_ttm")      -- TTM revenue in USD
ebitTtm            Decimal? @db.Decimal(20, 2) @map("ebit_ttm")         -- TTM EBIT in USD
sharesOutstanding  Decimal? @db.Decimal(20, 2) @map("shares_outstanding") -- diluted shares (from FMP profile)
epsTtm             Decimal? @db.Decimal(10, 4) @map("eps_ttm")          -- TTM EPS per diluted share
```
Placement in schema: after `cashAndEquivalents`/`totalDebt` block, in a new "// TTM absolute values" subsection.

### Task 2 — FMP adapter: extend `fetchMetadata()` to return sharesOutstanding
**File:** `src/modules/data-ingestion/adapters/fmp.adapter.ts`

**Endpoint confirmation:** `/profile` endpoint is **already confirmed** — `fetchMetadata()` (line 318) already calls `/stable/profile?symbol={ticker}`. No new method needed; extend the existing one.

**Specific change:** `fetchMetadata()` already extracts `marketCap` (as `market_cap_millions`). Extend to also extract `sharesOutstanding`:
```typescript
// In fetchMetadata(), add alongside marketCap extraction:
sharesOutstanding: item.sharesOutstanding != null ? Number(item.sharesOutstanding) : null,
```

**Pre-implementation verification required:** The `sharesOutstanding` field name in FMP profile response is NOT yet confirmed from a live call or fixture. Before implementing, run a live check against FMP `/stable/profile?symbol=AAPL` and confirm the exact field name (may be `sharesOutstanding`, `outstandingShares`, or similar). Update fixture `tests/fixtures/fmp-profile-response.json` (create it) with the real field name.

**`StockMetadata` canonical type update:** Add `sharesOutstanding?: number | null` field.

Return `null` if response is empty or `marketCap` field absent.

### Task 3 — Tiingo adapter: store absolute TTM values
**File:** `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — `fetchFundamentals()`

In the same TTM loop (Q0–Q3) already used for revenue growth:
- Store `earningsTtm = sum(netinc Q0–Q3)` — absolute net income in USD (same DataCode as used for TTM earnings growth)
- Store `revenueTtm = sum(revenue Q0–Q3)` — absolute revenue in USD (already computed for growth; also expose raw value)
- Store `ebitTtm = sum(ebit Q0–Q3)` — absolute EBIT in USD (same DataCode as Fix 1 in STORY-026)

Add to `FundamentalData` canonical type:
```typescript
earningsTtm?: number;   // absolute TTM net income, USD
revenueTtm?: number;    // absolute TTM revenue, USD
ebitTtm?: number;       // absolute TTM EBIT, USD
```

### Task 4 — Fundamentals sync service: persist absolute TTM values + compute trailing multiples
**File:** `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts`

In `buildUpdateFromFundamentals()`:
- Map `data.earningsTtm → earnings_ttm`
- Map `data.revenueTtm → revenue_ttm`
- Map `data.ebitTtm → ebit_ttm`

### Task 5 — New market cap sync step: fetch profile + compute all trailing multiples
**File:** `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts` (new method `syncMarketCapAndMultiples(ticker)`) or new service file if more appropriate.

Logic:
```typescript
// 1. Fetch profile
const profile = await fmpAdapter.fetchProfile(ticker);
if (!profile) return;

// 2. Fetch current stock state (needs earnings_ttm, revenue_ttm, ebit_ttm, current_price, total_debt, cash_and_equivalents)
const stock = await db.stock.findUnique({ where: { ticker } });
if (!stock) return;

// 3. Compute intermediates
const marketCap = profile.marketCap;
const sharesOutstanding = profile.sharesOutstanding;
const epsTtm = sharesOutstanding > 0 ? (stock.earningsTtm / sharesOutstanding) : null;
const ev = marketCap + (stock.totalDebt ?? 0) - (stock.cashAndEquivalents ?? 0);

// 4. Compute multiples (null if denominator invalid)
const trailingPe = epsTtm && epsTtm > 0 ? stock.currentPrice / epsTtm : null;
const trailingEvEbit = stock.ebitTtm && stock.ebitTtm > 0 ? ev / stock.ebitTtm : null;
const evSales = stock.revenueTtm && stock.revenueTtm > 0 ? ev / stock.revenueTtm : null;

// 5. Upsert
await db.stock.update({
  where: { ticker },
  data: {
    marketCap, sharesOutstanding, epsTtm,
    trailingPe, trailingEvEbit, evSales,
    dataProviderProvenance: { ...provenance, market_cap: { provider: 'fmp', synced_at: now, fallback_used: false } }
  }
});
```

**Execution order dependency:** Market cap sync must run AFTER fundamentals sync (needs `earnings_ttm`, `revenue_ttm`, `ebit_ttm`, `total_debt`, `cash_and_equivalents` from STORY-026 fixes).

### Task 6 — Provenance Tracking
The `syncMarketCapAndMultiples()` function must write provenance entries for all fields it writes, using the existing per-field provenance merge pattern from `fundamentals-sync.service.ts`:

| Field | Provider value | Notes |
|-------|---------------|-------|
| `market_cap` | `'fmp'` | Fetched directly from FMP profile |
| `shares_outstanding` | `'fmp'` | Fetched directly from FMP profile |
| `earnings_ttm` | `'tiingo'` | Written by Tiingo adapter in fundamentals sync |
| `revenue_ttm` | `'tiingo'` | Written by Tiingo adapter in fundamentals sync |
| `ebit_ttm` | `'tiingo'` | Written by Tiingo adapter in fundamentals sync |
| `eps_ttm` | `'computed'` | Derived from `earnings_ttm / shares_outstanding` |
| `trailing_pe` | `'computed'` | Derived from `current_price / eps_ttm` |
| `trailing_ev_ebit` | `'computed'` | Derived from `ev / ebit_ttm` |
| `ev_sales` | `'computed'` | Derived from `ev / revenue_ttm` |

Provider name `'computed'` is already an accepted value in the provenance JSONB spec (RFC-004 uses `'computed_trailing'`). Use `'computed'` for derived fields.

### Task 7 — Integration tests
**File:** `tests/integration/data-ingestion/market-cap-multiples.test.ts`

Test cases:
- AAPL `market_cap` non-null after profile sync
- AAPL `shares_outstanding` non-null and > 0
- AAPL `eps_ttm` non-null (= earnings_ttm / shares_outstanding)
- AAPL `trailing_pe` ≈ 28–33× (SA validation: AAPL trailing P/E ~30×)
- AAPL `trailing_ev_ebit` non-null and > 0
- AAPL `ev_sales` non-null and > 0 (SA: AAPL EV/Sales ≈ 7–9×)
- MSFT `trailing_pe` ≈ 33–38× (SA: MSFT trailing P/E ~35×)
- Stock with negative TTM earnings: `trailing_pe = null`

## Scope Out
- Forward P/E and forward EV/EBIT (STORY-028)
- EV as a stored column (computed inline from components; not stored to avoid denormalization)
- FMP shares from balance sheet endpoint (profile endpoint sufficient)
- Market cap in `market_cap_millions` — store in USD matching FMP return unit; downstream converts if needed

## FMP Endpoint Confirmation Status
| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /stable/profile?symbol={ticker}` | **CONFIRMED** | Already used by `fetchMetadata()` in fmp.adapter.ts line 319; returns `marketCap` field verified |
| `sharesOutstanding` field in profile response | **UNCONFIRMED** | Not in any existing fixture; requires live API verification before implementation |

## Dependencies
- STORY-026 Fix 6 (total_debt, cash_and_equivalents populated — needed for EV computation)
- STORY-026 Fix 1 (LTM EBIT — used as ebit_ttm source from Tiingo adapter)
- FMP `/profile` endpoint — verify available on current FMP plan tier before implementing

## Acceptance Criteria
- [ ] Schema migration applied; 5 new columns exist with correct types
- [ ] AAPL `market_cap` ≈ $3T (non-null, in USD)
- [ ] AAPL `shares_outstanding` ≈ 15B (non-null)
- [ ] AAPL `eps_ttm` ≈ $6.30–6.80 (SA: AAPL TTM diluted EPS ~$6.50)
- [ ] AAPL `trailing_pe` ≈ 28–33× (SA validation)
- [ ] AAPL `ev_sales` ≈ 7–9× (SA validation)
- [ ] MSFT `trailing_pe` ≈ 33–38× (SA validation)
- [ ] Stock with negative TTM net income: `trailing_pe = null` (not negative)
- [ ] `market_cap` provenance entry written with `provider: 'fmp'`
- [ ] All integration tests passing; no regression in STORY-023/STORY-024 suites

## Test Strategy
- Integration tests: run sync pipeline for AAPL, MSFT; assert values within ±3pp/3× of SA
- Unit tests: `computeTrailingMultiples(inputs)` — test null guards (negative EPS, zero revenue, missing total_debt)
- Regression: STORY-023 (6 tests) and STORY-024 (20 tests) must still pass

## Definition of Done
- [ ] Schema migration in `prisma/migrations/`
- [ ] Prisma schema updated with 5 new columns
- [ ] `FMPAdapter.fetchProfile()` implemented and tested with fixture
- [ ] `FundamentalData` canonical type updated with 3 new fields
- [ ] Tiingo adapter stores absolute TTM values
- [ ] Fundamentals sync service maps absolute TTM values to DB
- [ ] `syncMarketCapAndMultiples()` implemented and tested
- [ ] AAPL trailing_pe and ev_sales within SA ranges
- [ ] Integration log updated
- [ ] Story status updated to `done`

## Traceability
- Epic: EPIC-003
- RFC: RFC-004 §Fundamentals Sync; RFC-002 stocks table
- ADR: ADR-001 (FMP as secondary provider — profile endpoint)
- Downstream: EPIC-004 classification engine; EPIC-005 valuation engine (trailing_pe, trailing_ev_ebit, ev_sales are primary valuation inputs)
