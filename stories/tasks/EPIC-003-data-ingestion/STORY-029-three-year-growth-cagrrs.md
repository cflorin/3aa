# STORY-029 — 3-Year Growth CAGRs

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Fix `revenue_growth_3y` and `eps_growth_3y` to be actual 3-year CAGRs (currently storing YoY rates with misleading column names). Compute `share_count_growth_3y`, `gross_profit_growth`, and `eps_growth_fwd` (which depends on STORY-028's `eps_ntm` and `eps_ttm`). These feed directly into EPIC-004 earnings quality scoring: revenue and EPS CAGRs are used to bucket growth consistency.

## Story
As a **developer**,
I want **`revenue_growth_3y` and `eps_growth_3y` to contain actual 3-year CAGRs, and `share_count_growth_3y`, `gross_profit_growth` to be populated** —
so that **the classification engine receives accurate multi-year growth metrics rather than single-year approximations**.

## Outcome
- `revenue_growth_3y` = `(revenue_y0 / revenue_y3)^(1/3) − 1` (3-year CAGR using 4 annual periods)
- `eps_growth_3y` = `(eps_y0 / eps_y3)^(1/3) − 1` (3-year CAGR; null if base-year EPS ≤ 0)
- `share_count_growth_3y` = `(shares_y0 / shares_y3)^(1/3) − 1` (dilution tracking)
- `gross_profit_growth` = `(gross_profit_ttm − gross_profit_prior_ttm) / gross_profit_prior_ttm` (1-year YoY from Tiingo quarters)
- FMP income statement endpoint upgraded from `limit=2` to `limit=5` to supply 4+ annual periods
- **Out of scope:** `eps_growth_fwd` is computed in STORY-028 (depends on `eps_ntm` from forward estimates and `eps_ttm` from STORY-027); STORY-029 only provides the `eps_ttm` input via STORY-027

## Scope In

### Task 1 — FMP adapter: upgrade annual income statement to `limit=5`
**File:** `src/modules/data-ingestion/adapters/fmp.adapter.ts`

In `fetchFundamentals()`, change:
```typescript
// Before
`/stable/income-statement?symbol=${ticker}&period=annual&limit=2`
// After
`/stable/income-statement?symbol=${ticker}&period=annual&limit=5`
```

This returns up to 5 annual periods (year 0 = most recent full fiscal year; year 3 = 3 years prior).

Validate: response is `IncomeStatementEntry[]`, sorted newest-first. Required fields for CAGR computation:
- `revenue` — annual revenue in USD
- `eps` — diluted EPS per share
- `weightedAverageShsOutDil` — diluted shares outstanding

Return type change in `FundamentalData`:
```typescript
annualRevenues?: number[];           // 5 values, newest first (USD)
annualEps?: number[];                // 5 values, newest first ($/share)
annualShares?: number[];             // 5 values, newest first (diluted count)
grossProfitPriorTtm?: number;        // TTM gross profit from Q4–Q7 (for YoY growth)
```

### Task 2 — FMP adapter: compute CAGRs from annual array
**File:** `src/modules/data-ingestion/adapters/fmp.adapter.ts`

Add a shared helper (or inline in adapter):
```typescript
function cagr3y(current: number, base: number): number | null {
  if (!base || base <= 0 || !current) return null;
  return Math.pow(current / base, 1 / 3) - 1;
}
```

In `FMPAdapter.fetchFundamentals()`, after parsing annual statements:
```typescript
// Requires at least 4 periods (index 0 = most recent, index 3 = 3 years ago)
const revenueGrowth3y = annualRevenues.length >= 4
  ? cagr3y(annualRevenues[0], annualRevenues[3])
  : null;

const epsGrowth3y = (annualEps.length >= 4 && annualEps[3] > 0)
  ? cagr3y(annualEps[0], annualEps[3])
  : null;  // null if base-year EPS negative (CAGR meaningless for sign-change)

const shareCountGrowth3y = annualShares.length >= 4
  ? cagr3y(annualShares[0], annualShares[3])
  : null;
```

Assign to `FundamentalData`:
```typescript
revenueGrowth3y: revenueGrowth3y,   // replaces current revenueGrowth (was YoY)
epsGrowth3y: epsGrowth3y,           // replaces current epsGrowth (was YoY)
shareCountGrowth3y: shareCountGrowth3y,
```

**Backward note:** The YoY revenue growth currently stored in `revenue_growth_3y` and `eps_growth_3y` columns will be replaced by actual 3Y CAGRs. The `revenueGrowthYoy` field in `FundamentalData` (which maps to these columns) must be renamed to `revenueGrowth3y` to align with the DB column semantics. This is not a breaking change since the DB column name is already `revenue_growth_3y`.

### Task 3 — Tiingo adapter: compute gross_profit_growth (YoY TTM)
**File:** `src/modules/data-ingestion/adapters/tiingo.adapter.ts` — `fetchFundamentals()`

Using the same 8-quarter window already available (Q0–Q7):
- TTM gross profit = `sum(grossProfit Q0–Q3)` where `grossProfit = revenue − costRev` (DataCodes: `revenue`, `costRev`)
  - Or use Tiingo DataCode `grossProfit` directly if available
- Prior TTM gross profit = `sum(grossProfit Q4–Q7)`
- `grossProfitGrowth = (ttmGrossProfit − priorTtmGrossProfit) / priorTtmGrossProfit`

Add to `FundamentalData`:
```typescript
grossProfitGrowth?: number;
```

### Task 4 — Fundamentals sync service: map new growth fields
**File:** `src/modules/data-ingestion/jobs/fundamentals-sync.service.ts`

In `buildUpdateFromFundamentals()`, update mappings:
- `revenue_growth_3y ← data.revenueGrowth3y` (was `data.revenueGrowth3y` from FMP, now actual CAGR)
- `eps_growth_3y ← data.epsGrowth3y` (same — now actual CAGR)
- `share_count_growth_3y ← data.shareCountGrowth3y` (NEW mapping)
- `gross_profit_growth ← data.grossProfitGrowth` (NEW mapping — from Tiingo)

**Note on `eps_growth_fwd`:** This is computed in the forward estimates sync (STORY-028 Task 3), not here. STORY-029 only populates the historical CAGR fields.

### Task 5 — Provenance Tracking
All new fields populated by STORY-029 must include provenance entries. Extend `buildUpdateFromFundamentals()` in `fundamentals-sync.service.ts` to include these new fields:

| Field | Provider value | Source |
|-------|---------------|--------|
| `revenue_growth_3y` | `'fmp'` | Computed from FMP annual income statement (limit=5) |
| `eps_growth_3y` | `'fmp'` | Computed from FMP annual income statement (limit=5) |
| `share_count_growth_3y` | `'fmp'` | Computed from FMP `weightedAverageShsOutDil` |
| `gross_profit_growth` | `'tiingo'` | Computed from Tiingo 8-quarter window |

Note: these replace the existing `revenue_growth_3y` and `eps_growth_3y` provenance entries already written by the fundamentals sync (currently with provider 'tiingo' since they come from Tiingo). After this story, those two fields switch provider to 'fmp'. The provenance update documents this automatically.

**AC addition:** After running STORY-029 fixes, `data_provider_provenance.revenue_growth_3y.provider` = `'fmp'` (changed from 'tiingo').

### Task 6 — Integration tests
**File:** `tests/integration/data-ingestion/growth-cagrrs.test.ts`

Test cases:
- AAPL `revenue_growth_3y` ≈ 5–8% CAGR (SA: AAPL 3Y revenue CAGR ~6–7%)
- AAPL `eps_growth_3y` ≈ 10–16% CAGR (SA: AAPL 3Y EPS CAGR ~13%)
- AAPL `share_count_growth_3y` ≈ −3% to −5% (AAPL has consistent buybacks → negative dilution CAGR)
- AAPL `gross_profit_growth` non-null, reasonably positive
- MSFT `revenue_growth_3y` ≈ 13–17% CAGR (SA: MSFT 3Y revenue CAGR ~15%)
- Company with negative base-year EPS: `eps_growth_3y = null` (not NaN or crash)
- Company with < 4 annual periods: `revenue_growth_3y = null`

### Task 7 — STORY-025 AC update
Update `STORY-025-behavioral-validation-tests.md` acceptance criteria rows for `revenue_growth_3y` and `eps_growth_3y` with corrected CAGR values once integration tests pass.

## Scope Out
- EPS growth using GAAP vs non-GAAP reconciliation (non-GAAP EPS from FMP; this story uses GAAP EPS from FMP income statement `eps` field which is GAAP diluted EPS)
- `revenue_growth_fwd` — in STORY-028 (depends on `revenue_ntm` from FMP estimates)
- `eps_growth_fwd` — in STORY-028 (depends on `eps_ntm` from forward estimates sync)
- 5-year CAGRs (not in PRD; scope to add `limit=6` as future enhancement)
- Gross profit 3Y CAGR (PRD only requires 1-year gross profit growth; 3Y is future scope)

## Dependencies
- STORY-026 (Tiingo adapter TTM pattern — gross_profit_growth reuses same 8-quarter window)
- STORY-027 (none — this story runs independently from FMP annual income statement)
- STORY-028 (eps_growth_fwd computation — STORY-028 must run after STORY-029 populates eps_ttm, or they can run in same pass since eps_ttm comes from STORY-027)
- FMP `limit=5` availability on current plan tier — verify before implementation

## Acceptance Criteria
- [ ] FMP income statement request upgraded to `limit=5`
- [ ] AAPL `revenue_growth_3y` ≈ 5–8% (actual 3Y CAGR, not 10.7% YoY)
- [ ] AAPL `eps_growth_3y` ≈ 10–16% (actual 3Y CAGR)
- [ ] AAPL `share_count_growth_3y` ≈ −3% to −5% (negative due to buybacks)
- [ ] AAPL `gross_profit_growth` non-null, ≈ 5–12%
- [ ] MSFT `revenue_growth_3y` ≈ 13–17% CAGR
- [ ] Company with negative base-year EPS: `eps_growth_3y = null` (no crash)
- [ ] Company with < 4 annual periods available: `revenue_growth_3y = null`
- [ ] No regression in STORY-023 or STORY-024 suites

## Test Strategy
- Integration tests: AAPL, MSFT CAGRs within ±2pp of SA 3Y CAGRs
- Unit tests: `cagr3y(current, base)` — zero base, negative base, insufficient data array
- Regression: all existing tests pass

## Definition of Done
- [ ] FMP adapter upgraded to `limit=5` annual periods
- [ ] `FundamentalData` canonical type updated with `annualRevenues[]`, `annualEps[]`, `annualShares[]`, `grossProfitGrowth`
- [ ] CAGR computation implemented and tested
- [ ] Tiingo adapter computes `gross_profit_growth` from 8-quarter window
- [ ] Fundamentals sync service maps all 4 new growth fields
- [ ] STORY-025 AC rows updated with CAGR expected values
- [ ] Integration tests passing for AAPL, MSFT
- [ ] Implementation log updated
- [ ] Story status updated to `done`

## Traceability
- Epic: EPIC-003
- RFC: RFC-004 §Fundamentals Sync; RFC-002 stocks table
- ADR: ADR-001 (FMP as secondary provider — annual income statement)
- Downstream: EPIC-004 classification engine (revenue_growth_3y, eps_growth_3y feed earnings quality score bucket assignment)
