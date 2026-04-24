# STORY-049 — Universe Screen: Filters and Sort

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Add filtering and sorting to the universe screen stock table. Users can filter by sector, 3AA code (prefix match), confidence level, and monitoring status (active/inactive). They can sort by any column. Filter and sort state persists in URL query parameters so views are shareable and survive page refresh.

## Story
As a user,
I want to filter and sort the universe table by classification code, sector, confidence, and monitoring status,
so that I can quickly find stocks of interest.

## Outcome
The universe screen supports filter controls above the table and column sort via header clicks. Filtering and sort are driven by URL query params passed to `GET /api/universe` (server-side filtering, since the universe is too large for client-side loading). Each filter or sort change triggers a new API call with updated params. Pagination resets to page 1 on filter change.

## Scope In
- Filter controls rendered above the table:
  - **Sector filter:** multi-select dropdown of available sectors (fetched from `GET /api/universe/sectors`)
  - **3AA Code filter:** text input with prefix match (e.g., `"4"` → all 4xx codes; `"4A"` → 4Ax; `"4AA"` → exact)
  - **Confidence filter:** multi-select: `high`, `medium`, `low`, `no classification` (null)
  - **Monitoring status filter:** toggle `All` (default) | `Active only` | `Inactive only`
- Column sort: click column header → ascending; click again → descending; click again → unsorted
- Sortable columns: Ticker (default ASC), Rev Growth Fwd, EPS Growth Fwd, Operating Margin, Net Debt/EBITDA, FCF Conv
- `GET /api/universe` extended to accept filter/sort query params: `?sector=Technology&code=4&confidence=high,medium&monitoring=active&sort=ticker&dir=asc&page=1&limit=50`
- Active filter count badge on "Filters" button (e.g., `Filters (2)`)
- "Clear filters" resets all filters and URL params; pagination resets to page 1
- Filter + sort state in URL: navigating back restores filters; URL is shareable
- `GET /api/universe/sectors` — returns list of distinct sectors for filter dropdown

## Scope Out
- Saved filter presets
- Full-text company name search (prefix code filter and sector filter cover V1 needs)
- Client-side filtering (universe is server-paginated; filtering must happen server-side)

## Dependencies
- Epic: EPIC-004
- PRD: `docs/prd/PRD.md` §Screen 2 — Filters
- RFC: RFC-003 §Filtering and Sort
- Upstream: STORY-048 (universe screen table — this story adds filters to it)
- Upstream: STORY-046 (`GET /api/universe` — extended with filter params)

## Preconditions
- Universe screen table rendering data with pagination (STORY-048)
- `GET /api/universe` accepting `page` and `limit` params (STORY-046)

## Inputs
- URL query params for initial filter/sort state
- User interaction with filter controls and column headers
- Filter changes trigger new `GET /api/universe?...` calls

## Outputs
- Filtered and sorted stock rows from API, rendered in table
- URL updated to reflect current filter/sort state
- Pagination resets to page 1 on filter change

## Acceptance Criteria
- [ ] `GET /api/universe/sectors` returns distinct sectors from `stocks` table
- [ ] `GET /api/universe?sector=Technology` returns only technology stocks
- [ ] `GET /api/universe?code=4` returns only stocks with `active_code` starting with `"4"`
- [ ] `GET /api/universe?confidence=high,medium` returns only high and medium confidence stocks
- [ ] `GET /api/universe?monitoring=inactive` returns only deactivated stocks for current user
- [ ] `GET /api/universe?sort=revenue_growth_fwd&dir=desc` returns stocks sorted descending (null values last)
- [ ] Multiple filter params combine with AND logic
- [ ] Filter applied → pagination resets to page 1
- [ ] "Clear filters" → all filter controls reset, URL params cleared, page 1 loaded
- [ ] Active filter count badge reflects number of active filters
- [ ] Filter state persists in URL: refresh page → same filters applied
- [ ] Zero matches after filter → "No stocks match your current filters." message

## Test Strategy Expectations
- **Unit/component tests:**
  - Filter control renders correct state for each filter type
  - "Clear filters" resets all state and clears URL params
  - Active filter count badge: 2 filters active → badge shows `(2)`
- **API integration tests:**
  - `GET /api/universe?sector=Technology` → only technology stocks
  - `GET /api/universe?code=4` → only 4xx active_codes
  - `GET /api/universe?monitoring=inactive` → only deactivated stocks
  - `GET /api/universe?sort=ticker&dir=asc` → alphabetical order
  - Null sort values: stocks with null `revenue_growth_fwd` appear last when sorting by that field
  - Combined: `?sector=Technology&code=4&sort=ticker&dir=asc` → technology 4xx codes, alphabetical
  - `GET /api/universe/sectors` → returns array of strings
- **E2E tests:** see STORY-052

## Regression / Invariant Risks
- **Code filter over-match:** `"4"` must not match `"14"` or `"40"` — regex anchor test `^4` not substring
- **Filter reset leaves stale URL:** URL must be fully cleared on "Clear filters" — explicit URL-clear test
- **Null sort crash:** sorting by a nullable field must not throw — null-last test

## Key Risks / Edge Cases
- **No stocks in selected sector:** filter returns empty; "No stocks match filters" message
- **Confidence null filter:** stocks with no classification have `confidence_level = null`; they appear in "no classification" filter bucket, not hidden

## Definition of Done
- [ ] `GET /api/universe` extended with filter/sort query params
- [ ] `GET /api/universe/sectors` endpoint implemented
- [ ] Filter controls implemented (sector, code, confidence, monitoring status)
- [ ] Column sort implemented with null-last behavior
- [ ] URL state round-trip: set filter → refresh → same filter applied
- [ ] API integration tests for each filter and sort combination
- [ ] Traceability comments reference PRD §Filters, RFC-003 §Filtering and Sort
- [ ] No new TypeScript compilation errors
- [ ] Visual check: filters and sort work correctly in dev browser
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/PRD.md` §Screen 2 — Filters
- RFC: RFC-003 §Filtering and Sort
