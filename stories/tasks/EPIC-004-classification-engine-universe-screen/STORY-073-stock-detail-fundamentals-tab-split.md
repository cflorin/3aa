# STORY-073 — Stock Detail: Split Fundamentals into "Quarterly" and "Annual & Inferred" Tabs

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
in_progress

## Purpose
The current Fundamentals tab shows only snapshot/annual metrics. The quarterly history section added in STORY-071 is broken (clipped by `overflow: hidden` on the outer container and therefore invisible). Splitting Fundamentals into two dedicated tabs gives users a complete, always-visible view of every data point the system collects or infers.

## Story
As a **user reviewing a stock**,
I want **separate "Quarterly" and "Annual & Inferred" tabs on the stock detail page**,
so that **I can see all raw quarterly financial data in one place and all snapshot/inferred metrics in another, with nothing hidden or clipped**.

## Outcome
Replace the single "Fundamentals" tab with two tabs:

### Tab 1 — "Quarterly"
Displays data from `stock_quarterly_history` and `stock_derived_metrics`:
- **8-quarter table** (most recent first): Fiscal Quarter, Revenue, Gross Profit, Op. Income, Net Income, FCF, CFO, Gross Margin %, Op. Margin %, Net Margin % — monetary values in $M, NULL → `—`
- **Trend indicators panel** (from `stock_derived_metrics`):
  - Quarters available
  - Margin slopes 4q: gross, operating, net (pp/q with ▲/▼/— indicator + color)
  - EQ trend score (colored badge: ≥0.3 green, ≤-0.3 red, else amber)
  - Operating margin stability score (0.0–1.0)
  - Gross margin stability score (0.0–1.0)
  - Deteriorating cash conversion flag
  - Operating leverage emerging flag
  - Material dilution trend flag
  - SBC burden score
  - SBC as % revenue TTM
  - Diluted shares change 4q / 8q (%)
  - TTM rollups: Revenue TTM, Op. Income TTM, Net Income TTM, FCF TTM, Op. Margin TTM %, FCF Margin TTM %
- Empty state when no quarterly data ("No quarterly history available yet")
- Data lazy-loaded on first tab visit (same as History tab pattern)

### Tab 2 — "Annual & Inferred"
Displays all snapshot/inferred fields from the stock detail API — everything that is currently in the Fundamentals tab plus anything not currently displayed:
- **Growth** (Fwd, 3Y CAGR — revenue, EPS, gross profit)
- **EPS Reconciliation** (TTM GAAP, last FY Non-GAAP/GAAP, GAAP Adj Factor, NTM Non-GAAP raw, NTM GAAP-equiv)
- **Margins** (Gross, Operating, FCF — snapshot/TTM)
- **Returns & Quality** (FCF Conversion, ROIC, Net Income Positive, FCF Positive)
- **Balance Sheet** (Net Debt/EBITDA, Interest Coverage, Share Count Growth 3Y)
- **Market Context** (Market Cap, Price, P/E Ratio, EV/EBIT)
- **Qualitative Enrichment Scores** (E1 Moat, E2 Pricing Power, E3 Revenue Recurrence, E4 Margin Durability, E5 Capital Intensity, E6 Qualitative Cyclicality) — currently only shown in Classification tab, duplicated here for completeness
- **Classification Flags** (Holding Company, Insurer, Binary/Lottery, Cyclicality, Optionality Dominant, Pre-Operating Leverage, Material Dilution)

### Tab bar after change
`Classification | Quarterly | Annual & Inferred | Valuation | History`

### Removals
- Remove the broken collapsible "Quarterly Financial History" section that was rendered outside the tab container (lines ~1048–1159 in `StockDetailClient.tsx`)
- No changes to Classification, Valuation, or History tabs

## Scope In
- `src/components/stock-detail/StockDetailClient.tsx` — replace Fundamentals tab with two new tabs; remove broken collapsible section
- Lazy-load pattern for Quarterly tab (fetch `/api/stocks/[ticker]/quarterly-history` on first visit)
- `src/app/api/stocks/[ticker]/quarterly-history/route.ts` already exists — add `gross_margin_stability_score`, `sbc_as_pct_revenue_ttm`, `revenue_ttm`, `operating_income_ttm`, `net_income_ttm`, `free_cash_flow_ttm`, `operating_margin_ttm`, `fcf_margin_ttm` to the `derivedOut` response (they exist in the schema but were omitted from the route)

## Scope Out
- Charts or sparklines
- New API endpoints (reuse existing `/api/stocks/[ticker]` and `/api/stocks/[ticker]/quarterly-history`)
- Changes to universe screen

## Dependencies
- STORY-053 (stock detail page base)
- STORY-071 (quarterly history API — already exists)

## Acceptance Criteria
- [ ] Tab bar shows: Classification | Quarterly | Annual & Inferred | Valuation | History
- [ ] Quarterly tab: 8-quarter table renders with correct columns and $M formatting
- [ ] Quarterly tab: Trend indicators panel shows all derived metrics with NULL → `—`
- [ ] Quarterly tab: empty state shown when no data
- [ ] Quarterly tab: data loads on first tab visit (not eagerly on page load)
- [ ] Annual & Inferred tab: all fields currently in Fundamentals tab are present
- [ ] Annual & Inferred tab: E1–E6 enrichment scores are present
- [ ] Annual & Inferred tab: all values show `—` for null fields
- [ ] Broken collapsible section is removed
- [ ] No content clipped by overflow:hidden
