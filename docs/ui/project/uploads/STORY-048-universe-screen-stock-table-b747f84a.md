# STORY-048 — Universe Screen: Stock Table

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the Universe Screen (Screen 2 per PRD) — the authenticated main view showing ALL in-universe stocks in a paginated table. Each row displays the stock's key fundamentals, classification code, confidence level, and monitoring status (active/deactivated by the user). This is the primary navigation hub for the application.

## Story
As a user,
I want to see all stocks in the universe in a paginated table with their classification codes and key metrics,
so that I can quickly review and navigate my investment universe.

## Outcome
A `/universe` page exists behind authentication. It fetches all in-universe stocks from `GET /api/universe` (paginated 50/page) and renders a table. Each row shows ticker, company, sector, 3AA code badge, confidence, monitoring status, and a set of key fundamental fields. Pagination controls navigate through the full universe.

## Scope In
- Next.js page at `src/app/(authenticated)/universe/page.tsx`
- Table columns (V1): `Ticker`, `Company`, `Sector`, `3AA Code` (badge), `Confidence`, `Monitoring` (Active/Inactive badge), `Rev Growth Fwd`, `EPS Growth Fwd`, `FCF Conv`, `Net Debt/EBITDA`, `Operating Margin`
- **Pagination controls:** Previous / Next buttons, page indicator `"Page 1 of 20"`, 50 stocks per page (per EPIC-004 spec: 1000 stocks, 50/page)
- 3AA Code badge: color-coded by bucket number; shows code text (e.g., `4AA`) or `—` if null
- Confidence badge: `high` (green), `medium` (yellow), `low` (orange), `—` (no classification yet)
- Monitoring badge: `Active` (default, no badge needed) or `Inactive` (muted, highlighted in row)
- Empty state: "No stocks in universe." (should not occur in production; shown for empty test DB)
- Loading state: skeleton rows while fetching
- Error state: error message if API call fails
- Responsive: horizontal scroll on mobile; full table on desktop
- Authentication guard: redirect to sign-in if session absent (existing middleware)

## Scope Out
- Filters and sort (STORY-049)
- Deactivate/reactivate controls in the table (STORY-050)
- Classification override modal (STORY-051)
- Stock detail page / drill-down view

## Dependencies
- Epic: EPIC-004
- PRD: `docs/prd/PRD.md` §Screen 2 — Universe / Monitor List, §UI Components
- RFC: RFC-003 §Universe Screen
- Upstream: STORY-046 (`GET /api/universe` — paginated, all in-universe stocks with per-user monitoring status)
- Upstream: STORY-012 (session middleware / authentication guard)

## Preconditions
- `GET /api/universe` operational with pagination (STORY-046)
- Authentication middleware operational (STORY-012)
- Existing Next.js app structure (STORY-008)

## Inputs
- `GET /api/universe?page=1&limit=50` response
- User session (from session middleware)

## Outputs
- Rendered `/universe` page visible to authenticated users
- Paginated table rows with data from API

## Acceptance Criteria
- [ ] `/universe` route exists and redirects unauthenticated users to sign-in
- [ ] Authenticated user sees table with all in-universe stocks (paginated 50/page)
- [ ] Table columns present: Ticker, Company, Sector, 3AA Code, Confidence, Monitoring, Rev Growth Fwd, EPS Growth Fwd, FCF Conv, Net Debt/EBITDA, Operating Margin
- [ ] 3AA Code displayed as styled badge (bucket color) or `—` when null
- [ ] Confidence displayed as colored badge or `—` when null
- [ ] Monitoring badge: `Inactive` shown for deactivated stocks; no badge (or subtle indicator) for active stocks
- [ ] Pagination: Previous / Next buttons; page indicator `"Page X of Y"`; Previous disabled on page 1; Next disabled on last page
- [ ] Navigating to page 2 loads next 50 stocks
- [ ] Empty state message shown if universe is empty (test environment only)
- [ ] Loading skeleton shown while data fetches
- [ ] Error message shown if API returns error
- [ ] Page accessible: semantic `<table>` with `scope` headers
- [ ] Mobile: horizontal scroll without breaking layout

## Test Strategy Expectations
- **Unit/component tests:**
  - `<StockTable>` with mock 50-stock data → renders 50 rows
  - `<ClassificationBadge>` with code `"4AA"` → correct bucket color
  - `<ClassificationBadge>` with `null` → renders `—`
  - `<PaginationControls>` with `page=1, totalPages=20` → Previous disabled, Next enabled
  - `<PaginationControls>` with `page=20, totalPages=20` → Next disabled
  - Inactive monitoring badge: stock with `is_active=false` → `Inactive` badge shown
- **Integration tests:**
  - Unauthenticated GET `/universe` → 302 redirect to sign-in
  - Authenticated GET `/universe` → 200 HTML with expected table structure
  - GET `/universe?page=2` → second page of stocks rendered
- **E2E tests:** see STORY-052

## Regression / Invariant Risks
- **Auth guard removal:** if middleware config changes and `/universe` becomes accessible without session — integration test
- **Pagination missing:** if pagination controls are removed, users with large universes can't navigate — pagination control test
- **null code crash:** if null `active_code` causes badge component to crash — explicit null badge test

## Key Risks / Edge Cases
- **Stock with null classification:** `active_code = null` — badge renders `—`, not crash
- **Very long company name:** truncate with CSS
- **Total pages = 1:** pagination shows page `"1 of 1"` and both buttons disabled

## Definition of Done
- [ ] `/universe` page implemented with pagination
- [ ] `<StockTable>`, `<ClassificationBadge>`, `<ConfidenceBadge>`, `<PaginationControls>` components implemented
- [ ] Unit/component tests for badge components, table, and pagination
- [ ] Integration test: auth guard and basic page render
- [ ] Traceability comments reference PRD §Screen 2, RFC-003 §Universe Screen
- [ ] No new TypeScript compilation errors
- [ ] Visual check: pagination works correctly in dev browser (dev server used to verify)
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/PRD.md` §Screen 2 — Universe / Monitor List
- RFC: RFC-003 §Universe Screen
