# STORY-080 — Universe Screen: Valuation Zone Column & Filters

## Epic
EPIC-005 — Valuation Threshold Engine & Enhanced Universe

## Purpose
Add valuation zone visibility to the Universe Screen (Stock Table): a sortable zone column, a zone filter, current multiple display, and a TSR hurdle column. Users can immediately see which stocks are attractively priced without navigating to each stock's detail page.

## Story
As an authenticated user on the Universe Screen,
I want to see each stock's valuation zone and current multiple in the stock table, and filter by zone,
so that I can quickly identify attractively valued stocks in my universe.

## Outcome
The Universe Screen stock table gains three new columns (`Zone`, `Multiple`, `TSR Hurdle`) and a zone filter. The zone badge uses the same color conventions as the Valuation Tab. Stocks with no valuation state show a "—" placeholder. The zone filter allows multi-select of valuation zones (including `not_computed`).

## Scope In
- New columns in universe stock table:
  - **Zone**: colored badge matching STORY-079 zone colors; "—" if no valuation state
  - **Multiple**: `{value}x ({basis})` e.g. "18.2x (fwd P/E)"; "—" if null
  - **TSR Hurdle**: `{adjusted}%`; "—" if null or B8
- Zone filter: multi-select dropdown; options: `steal_zone`, `very_good_zone`, `comfortable_zone`, `max_zone`, `above_max`, `not_applicable`, `not_computed` (stocks without valuation state)
- Sort by Zone column: ordering by zone quality (steal_zone → very_good_zone → comfortable_zone → max_zone → above_max → not_applicable → not_computed)
- Universe Screen API (`GET /api/universe`) updated to LEFT JOIN `valuation_state` and return zone fields in each stock row (the route lives at `src/app/api/universe/route.ts`, not `/api/universe/stocks`)
- `not_computed` filter: returns stocks where `valuation_state` row is missing (LEFT JOIN IS NULL)
- Columns default hidden on initial load (user can toggle via column visibility control if already implemented; otherwise default visible)

## Scope Out
- Inline zone editing (override is on Stock Detail page, STORY-079)
- Valuation history on universe screen
- Alert integration (EPIC-006)

## Dependencies
- STORY-079 (zone badge component — reuse `ValuationZoneBadge` sub-component)
- STORY-048/049 (Universe Screen stock table + filters — extend existing implementation)
- STORY-077 (valuation batch must have run for stocks to have zone data)

## Preconditions
- `valuation_state` table populated for at least some stocks (STORY-077 batch run)
- Universe Screen exists at `src/app/(authenticated)/universe/page.tsx` (STORY-048)
- Existing filter/sort infrastructure can accept new filter type

## API Changes
`GET /api/universe` response: each stock row extended with:
```json
{
  "ticker": "AAPL",
  ...existing fields...,
  "valuationZone": "comfortable_zone",
  "currentMultiple": 18.2,
  "currentMultipleBasis": "forward_pe",
  "adjustedTsrHurdle": 11.5,
  "valuationStateStatus": "ready"
}
```
`null` for all valuation fields if no `valuation_state` row exists (LEFT JOIN).

**New query parameters:**
- `valuationZone=steal_zone,very_good_zone` (comma-separated, multi-select)
- `sortBy=valuationZone` (new sort key)

## Acceptance Criteria
- [ ] Zone column renders colored badge per zone; "—" for stocks with no valuation state
- [ ] Multiple column renders `{value}x ({basis})` or "—"
- [ ] TSR Hurdle column renders `{adjusted}%` or "—"
- [ ] Zone filter: selecting one or more zones restricts table to matching rows
- [ ] `not_computed` filter option: shows only stocks with no valuation_state row
- [ ] Sort by Zone: correct quality ordering (steal best → above_max worst)
- [ ] API JOIN does not break when no valuation_state exists (LEFT JOIN, nulls tolerated)
- [ ] Existing filters (bucket, classification code, EQ/BS grade) still work alongside zone filter
- [ ] Pagination correct with zone filter applied
- [ ] Performance: JOIN does not cause timeout for 500-stock universe (index on valuation_zone exists)

## Test Strategy Expectations
- Unit tests:
  - Zone badge renders correct color per zone value
  - "—" rendered when valuationZone is null
  - Zone filter multi-select builds correct query string
  - Sort by zone applies correct ordering
- Integration tests:
  - GET /api/universe?valuationZone=steal_zone → only stocks in steal_zone returned
  - GET /api/universe?valuationZone=not_computed → only stocks with no valuation_state
  - GET /api/universe?sortBy=valuationZone → ordered by zone quality
  - Pagination + zone filter combined: correct offset/limit applied
- E2E:
  - Navigate to Universe Screen → Zone column visible; at least some stocks show zone badge
  - Select "Steal Zone" filter → table refreshes; all visible rows show steal_zone badge
  - Clear filter → all stocks return

## Regression / Invariant Risks
- LEFT JOIN must not accidentally exclude stocks with no valuation_state (was previously a INNER JOIN risk in classification join pattern)
- Zone sort ordering must be deterministic when multiple stocks share the same zone (secondary sort by ticker alphabetical)
- Existing sort/filter/pagination tests must continue passing (STORY-049 regression)

## Definition of Done
- [ ] Universe Screen table updated with 3 new columns
- [ ] Zone filter implemented
- [ ] `GET /api/universe` extended with valuation fields and zone filter support
- [ ] Unit + integration + E2E tests passing
- [ ] Implementation log updated
- [ ] Traceability comments (`// EPIC-005: ... STORY-080: ...`)

## Traceability
- Epic: EPIC-005 — Valuation Threshold Engine & Enhanced Universe
- PRD: `docs/prd/3_aa_valuation_threshold_workflow_prd_v_1.md` §US-VAL-003 (universe zone visibility)
- RFC: RFC-003 — Valuation & Threshold Engine Architecture §Universe Screen Integration
- STORY-048: Universe Screen stock table (base implementation)
- STORY-049: Filters and sort (base implementation to extend)
