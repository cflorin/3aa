# STORY-029 — 3-Year Growth CAGRs

## Epic
EPIC-003 — Data Ingestion & Universe Management

## Purpose
Populate `revenue_growth_3y`, `eps_growth_3y`, `share_count_growth_3y`, and `gross_profit_growth` correctly. STORY-020 incorrectly wrote `revenue_growth_yoy` to `revenue_growth_3y` and `eps_growth_yoy` to `eps_growth_3y`. This story computes the actual 3-year CAGRs and fixes the misrouting.

## Story
As a **developer**,
I want **`revenue_growth_3y`, `eps_growth_3y`, `share_count_growth_3y`, and `gross_profit_growth` to contain correct computed values** —
so that **the classification engine receives accurate multi-year growth data rather than YoY proxies**.

## Outcome
- `revenue_growth_3y` = CAGR of revenue over 3 years (percentage: 10 = 10%)
- `eps_growth_3y` = CAGR of diluted EPS over 3 years (null when base EPS ≤ 0)
- `share_count_growth_3y` = CAGR of diluted share count over 3 years (FMP only; null from Tiingo)
- `gross_profit_growth` = YoY gross profit growth (TTM vs prior TTM; percentage)
- Existing misrouting corrected: `revenue_growth_yoy` and `eps_growth_yoy` no longer written to 3y columns

## Scope In

### Task 1 — Extend FundamentalData type
Add to `types.ts`:
```typescript
revenue_growth_3y: number | null;    // 3-year revenue CAGR, percentage
eps_growth_3y: number | null;        // 3-year EPS CAGR, percentage; null when base EPS ≤ 0
gross_profit_growth: number | null;  // YoY gross profit growth, percentage
share_count_growth_3y: number | null; // 3-year diluted share count CAGR, percentage (FMP only)
```

### Task 2 — FMP adapter: limit=5 + CAGR computations
- Change income statement fetch to `limit=5` (was `limit=2`)
- Compute 3-year CAGRs using index 0 (latest) vs index 3 (3 years ago):
  - `revenue_growth_3y = cagr(rev_0, rev_3, 3)`
  - `eps_growth_3y = cagr(epsDiluted_0, epsDiluted_3, 3)` — null when base ≤ 0
  - `share_count_growth_3y = cagr(shares_0, shares_3, 3)` from `weightedAverageShsOutDil`
  - `gross_profit_growth = (gp_0 - gp_1) / |gp_1| × 100` (YoY from annual data)
- CAGR formula: `(end/start)^(1/3) - 1) × 100`; null when start ≤ 0 or end ≤ 0
- Update fixture: add FY2021 and FY2020 periods; add `weightedAverageShsOutDil` field

### Task 3 — Tiingo adapter: grossProfit DataCode + 3-year window
- Add `grossProfit` DataCode reading from income statement
- Compute `gross_profit_growth` from 8-quarter window (TTM vs prior TTM gross profit)
- Compute `revenue_growth_3y` and `eps_growth_3y` from 16-quarter window (Q0–Q3 vs Q12–Q15); null when fewer than 16 quarters
- `share_count_growth_3y = null` (share count not available from Tiingo fundamentals)
- Update fixture: add `grossProfit` DataCode to all existing quarters; add Q9–Q16 for 3-year CAGR

### Task 4 — Fix fundamentals-sync.service.ts
- Remove wrong mapping: `revenueGrowth3y ← revenue_growth_yoy` (was using YoY for 3y column)
- Remove wrong mapping: `epsGrowth3y ← eps_growth_yoy`
- Add correct mappings: `revenue_growth_3y → revenueGrowth3y`, `eps_growth_3y → epsGrowth3y`
- Add new mappings: `gross_profit_growth → grossProfitGrowth`, `share_count_growth_3y → shareCountGrowth3y`

### Task 5 — Unit tests
`tests/unit/data-ingestion/story-029-growth-cagrs.test.ts`

## Acceptance Criteria
- [ ] `revenue_growth_3y` contains CAGR, not YoY growth
- [ ] `eps_growth_3y` = null when base EPS ≤ 0
- [ ] `gross_profit_growth` non-null from FMP (annual data available)
- [ ] AAPL 3-year revenue CAGR ≈ 11–13% (FY2020 → FY2023)
- [ ] AAPL 3-year EPS CAGR ≈ 22–24% (FY2020 → FY2023)
- [ ] AAPL share count CAGR ≈ −3 to −4% (buybacks reducing share count)
- [ ] No regression in existing unit tests

## Traceability
- Epic: EPIC-003
- RFC: RFC-002 stocks table; RFC-004 §Fundamentals Sync
- ADR: ADR-001 (Tiingo primary; FMP fallback)
