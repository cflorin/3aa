# STORY-070 — Universe Screen: Quarterly Trend Metrics Columns & Filters

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
ready

## Purpose
Extend the universe screen stock table and filter panel to expose key quarterly trend metrics from `stock_derived_metrics`. Users can sort and filter by margin trajectory, EQ trend score, dilution status, and data availability — using the same table/filter UI patterns already established in STORY-048 and STORY-049.

## Story
As a **user monitoring stocks**,
I want **to see quarterly trend metrics in the universe screen table and filter by trend signals**,
so that **I can identify stocks with improving or deteriorating earnings quality trends and quickly surface stocks with material dilution or unstable margins**.

## Outcome
- Universe screen table (`src/app/(authenticated)/stocks/` or equivalent) extended with optional quarterly trend metric columns:
  - `operating_margin_slope_4q` (pp/quarter — displayed as trend direction icon + value)
  - `earnings_quality_trend_score` (−1.0 to +1.0 — displayed as colored badge: green >0.3, red <−0.3, neutral otherwise)
  - `material_dilution_trend_flag` (boolean — icon indicator)
  - `quarters_available` (integer — data availability indicator)
- Columns are togglable (hidden by default; user can add via column chooser consistent with existing pattern)
- Filter panel extended: filter by `earnings_quality_trend_score` range, `material_dilution_trend_flag = true`, `quarters_available >= N`
- Sort: all new columns sortable; NULL values sorted last
- When `stock_derived_metrics` has no row for a ticker (stock has no quarterly data yet): cells display `—` (dash), not blank or error
- API route `GET /api/universe/stocks` extended to include `stock_derived_metrics` fields in response when requested (query param `?include=trend` or similar, consistent with existing API design)
- Consistent with existing table component, column definitions, and theme (no new UI primitives)

## Scope In
- Universe screen table: 4 new optional columns
- Column chooser integration
- Filter panel: EQ trend score range filter, dilution flag filter, quarters_available filter
- API response extension: `stock_derived_metrics` fields added to universe stock payload (LEFT JOIN)
- NULL/absent handling: `—` displayed; NULL sorts last
- Existing table pagination, sorting, filter state management unchanged

## Scope Out
- Stock detail page quarterly history section — STORY-071
- All other `stock_derived_metrics` fields beyond the 4 specified columns (future story)
- New chart/visualization components (columns are text/badge/icon only in V1)

## Dependencies
- **Epic:** EPIC-004
- **RFCs:** RFC-008 §Classifier-Facing Derived Fields, RFC-002 Amendment 2026-04-25
- **Upstream:** STORY-048 (universe screen table), STORY-049 (filters and sort), STORY-058 (`stock_derived_metrics` table), STORY-062 (trend fields populated)

## Preconditions
- Universe screen table and filter panel exist (STORY-048, STORY-049)
- `stock_derived_metrics` table and Prisma model exist (STORY-058)
- API route `GET /api/universe/stocks` exists

## Inputs
- `stock_derived_metrics` LEFT JOIN in universe stocks API query
- User column-chooser selections (persisted in existing preference mechanism or session state)
- User filter panel selections

## Outputs
- Table with optional trend metric columns
- Filtered/sorted results respecting trend metric filters
- API response includes trend fields when requested

## Acceptance Criteria
- [ ] `operating_margin_slope_4q` column: trend direction icon (up/flat/down) + numeric value displayed
- [ ] `earnings_quality_trend_score` column: green badge (>0.3), red badge (<−0.3), neutral badge (−0.3 to 0.3)
- [ ] `material_dilution_trend_flag` column: icon indicator (flag present / absent)
- [ ] `quarters_available` column: integer count, `—` when no row
- [ ] Columns are togglable via column chooser; hidden by default
- [ ] Filter: EQ trend score range (e.g., min/max slider or presets) correctly filters results
- [ ] Filter: `material_dilution_trend_flag = true` shows only flagged stocks
- [ ] Filter: `quarters_available >= N` (preset options: ≥4, ≥8) filters correctly
- [ ] NULL values display as `—`; sort places NULL rows last
- [ ] API returns trend fields in response when requested; no breaking change to existing response shape
- [ ] Existing universe screen tests pass without modification
- [ ] Visual consistency with existing table columns and filter panel styling (same component library, same theme)

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-008 §Classifier-Facing Derived Fields, RFC-002 Amendment 2026-04-25
- ADR: ADR-015 §Schema
