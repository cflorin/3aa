# STORY-071 — Stock Detail Page: Quarterly Financial History Section

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
ready

## Purpose
Add a "Quarterly Financial History" section to the stock detail page that displays the raw per-quarter financial data from `stock_quarterly_history` and the derived trend metrics from `stock_derived_metrics`. Gives users visibility into the underlying data driving EQ scores and trend signals, using the same card/section layout already established in STORY-053.

## Story
As a **user reviewing a specific stock**,
I want **to see a quarterly financial history section on the stock detail page showing raw quarterly financials and trend indicators**,
so that **I can understand the trend data behind the stock's EQ score, margin trajectory, and dilution signals**.

## Outcome
- New "Quarterly Financial History" section on the stock detail page (`src/app/(authenticated)/stocks/[ticker]/`)
- Section is collapsed by default (expand via toggle); does not displace existing fundamentals or classification sections
- **Quarterly history table**: displays the last 8 quarters from `stock_quarterly_history` (columns: Fiscal Quarter, Revenue, Gross Profit, Operating Income, Net Income, FCF, CFO, Gross Margin %, Operating Margin %, Net Margin %); monetary values in millions; NULL displayed as `—`
- **Trend indicators panel**: displays key fields from `stock_derived_metrics`:
  - Margin slopes (4q): gross, operating, net (pp/q with up/flat/down indicator)
  - EQ trend score (colored badge, same style as STORY-070)
  - Operating margin stability score (0.0–1.0 progress bar or text)
  - Dilution metrics: diluted shares change 4q/8q (%), `material_dilution_trend_flag`
  - SBC burden score (0.0–1.0 display)
  - `quarters_available` count with data freshness note (`synced_at` of most recent row)
- When no quarterly data available (`stock_derived_metrics` absent or `quarters_available = 0`): section visible but displays empty state message ("No quarterly history available yet")
- New API endpoint `GET /api/stocks/[ticker]/quarterly-history` returning `{ quarters: StockQuarterlyHistory[], derived: StockDerivedMetrics | null }`
- Consistent with existing stock detail page card layout and theme (STORY-053, STORY-054)

## Scope In
- `src/app/(authenticated)/stocks/[ticker]/` — new quarterly history section component
- `src/app/api/stocks/[ticker]/quarterly-history/route.ts` — new GET endpoint
- Collapsible section (default collapsed)
- Quarterly table: last 8 quarters, monetary values in M, margin percentages
- Trend indicators panel: slopes, EQ score, stability, dilution, SBC
- Empty state when no data
- Existing page sections (fundamentals, classification, enrichment) untouched

## Scope Out
- Charts or sparklines (text/table display only in V1)
- Per-quarter drill-down or detail modal
- Editing or overriding quarterly data
- The universe screen trend columns — STORY-070

## Dependencies
- **Epic:** EPIC-004
- **RFCs:** RFC-008 §Classifier-Facing Derived Fields, RFC-002 Amendment 2026-04-25
- **ADRs:** ADR-015 §Schema
- **Upstream:** STORY-053 (stock detail page), STORY-054 (UI theme), STORY-057 (`stock_quarterly_history`), STORY-058 (`stock_derived_metrics`), STORY-062 (trend fields populated)

## Preconditions
- Stock detail page exists (STORY-053) with established section layout
- `stock_quarterly_history` and `stock_derived_metrics` tables exist and populated
- Authentication middleware in place for API routes

## Inputs
- `GET /api/stocks/[ticker]/quarterly-history` — returns quarters array + derived metrics row
- `stock_quarterly_history` rows ordered by fiscal_year DESC, fiscal_quarter DESC
- `stock_derived_metrics` row for ticker (or null)

## Outputs
- Quarterly history section rendered on stock detail page
- New API endpoint at `GET /api/stocks/[ticker]/quarterly-history`

## Acceptance Criteria
- [ ] Section appears on stock detail page below existing sections; collapsed by default
- [ ] Expanding section reveals quarterly table with last 8 quarters of data
- [ ] Table columns: Fiscal Quarter, Revenue (M), Gross Profit (M), Operating Income (M), Net Income (M), FCF (M), CFO (M), Gross Margin %, Operating Margin %, Net Margin %
- [ ] NULL financial values displayed as `—`
- [ ] Trend indicators panel shows margin slopes with direction icons, EQ trend score badge, stability score, dilution metrics, SBC burden score, quarters_available
- [ ] Empty state message displayed when no data available
- [ ] API returns correct shape: `{ quarters: [...], derived: {...} | null }`
- [ ] API returns 404 when ticker not found
- [ ] Styling consistent with existing stock detail page cards (same component library, theme, spacing)
- [ ] Existing stock detail page sections unaffected (no regression)
- [ ] Unit tests for API route: valid ticker with data, valid ticker without quarterly data (empty state), invalid ticker (404)

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-008 §Classifier-Facing Derived Fields, RFC-002 Amendment 2026-04-25
- ADR: ADR-015 §Schema
