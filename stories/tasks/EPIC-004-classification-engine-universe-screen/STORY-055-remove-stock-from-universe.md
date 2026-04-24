# STORY-055 — Remove Stock from Universe

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Allow a user to permanently remove a single stock from their monitored universe directly from the UI. This closes the gap left by STORY-050's explicit scope-out ("remove from universe — stocks cannot be removed via UI"). With STORY-056 (Add Stock) shipping alongside, the user can now fully manage universe membership from the UI without touching the admin pipeline.

## Story
As a user,
I want to remove a stock from my universe with a single confirmed action from the universe screen,
so that I can keep my universe relevant without needing admin pipeline access.

## Outcome
Each row in the universe screen table gains a "Remove" action (in the row action menu or as a dedicated icon). Clicking it shows a confirmation dialog. Confirming calls `DELETE /api/universe/stocks/[ticker]` which sets `inUniverse = false` and removes the stock from the universe screen. The stock record is retained in the database (hard-delete is out of scope — tombstoned only).

## Architecture: API

### `DELETE /api/universe/stocks/[ticker]`

- **Auth:** authenticated session (same auth as all universe routes)
- **Effect:** sets `stocks.inUniverse = false`, sets `stocks.universeStatusChangedAt = now()`; does NOT delete the DB row
- **Response 200:** `{ ticker, removed: true, removedAt: ISO-string }`
- **Response 404:** ticker not in universe
- **Response 409:** ticker already removed (idempotent guard)
- File: `src/app/api/universe/stocks/[ticker]/route.ts` (DELETE handler, alongside the GET handler added in STORY-056)

### Why soft-delete only
Hard-deleting a stock row cascades to `userMonitoredStocks`, `userClassificationOverrides`, `classificationHistory`, `alerts`, `valuationHistory` — all of which are foreign-keyed to `stocks`. Soft-delete (inUniverse = false) preserves history and allows re-adding the stock via STORY-056 without data loss.

## Scope In
- "Remove" action on each universe screen table row (button or row-action menu item)
- Confirmation dialog: `"Remove [TICKER] from your universe? This cannot be undone from the UI."` + Remove / Cancel
- On confirm: `DELETE /api/universe/stocks/[ticker]` → stock disappears from the universe table
- Optimistic removal: row removed immediately from table on confirm; if API fails → row restored + error toast
- Stock detail page: if user navigates directly to `/stocks/[ticker]` for a removed stock → 404 page with "This stock is not in your universe"

## Scope Out
- Hard database delete (row retention required for history)
- Bulk removal
- Undo / re-add from this story (covered by STORY-056)
- Admin-level cascade removal (admin pipeline controls inUniverse in bulk)

## Dependencies
- Epic: EPIC-004
- Upstream: STORY-048 (universe screen table — row action added here)
- Upstream: STORY-053 (stock detail page — 404 state added here)
- Related: STORY-056 (add stock — inverse operation)

## Preconditions
- Universe screen table rendered (STORY-048 ✅)
- Authenticated user session

## Inputs
- User click on "Remove" action for a row
- Confirmation click

## Outputs
- `DELETE /api/universe/stocks/[ticker]` — sets `inUniverse = false`
- Optimistic row removal from universe table
- 404 state on stock detail page for removed ticker

## Acceptance Criteria
- [ ] Each universe table row has a "Remove" action (icon, button, or row-action menu item)
- [ ] Clicking "Remove" shows confirmation dialog with stock ticker and warning text
- [ ] Confirming → `DELETE /api/universe/stocks/[ticker]` called → row removed from table
- [ ] Cancelling → no change; dialog closed
- [ ] Optimistic: row disappears immediately on confirm; restored + error toast if API fails
- [ ] Removed stock no longer appears in universe screen (including after page refresh)
- [ ] `DELETE` on a ticker not in universe → 404 response
- [ ] Navigating to `/stocks/[ticker]` for a removed stock → 404 / "not in universe" page
- [ ] Stock DB row is NOT deleted (inUniverse = false, row retained)

## Test Strategy
- **Unit tests:**
  - DELETE route: 200 sets inUniverse=false; 404 for unknown ticker; 409 if already removed
  - Mock Prisma `stock.update` and verify `inUniverse: false` + `universeStatusChangedAt` set
- **Component tests:**
  - Row: "Remove" button visible; clicking shows confirmation; cancel → hidden
  - Confirm → optimistic row removal; mock API error → row restored
- **Manual smoke test (use benchmark stocks):**
  - Remove TSLA from universe → disappears from table
  - Navigate to `/stocks/TSLA` → 404/not-in-universe shown
  - Re-add via STORY-056 → TSLA returns with fresh classification

## Regression / Invariant Risks
- **Other rows affected:** removing one stock must not affect other rows
- **History preserved:** after remove, classification history for the stock must still exist in DB

## Key Risks / Edge Cases
- **Last stock removed:** table shows empty state — should not crash
- **Re-adding removed stock (STORY-056):** pipeline should reset `inUniverse = true` and re-run without data loss

## Definition of Done
- [ ] `DELETE /api/universe/stocks/[ticker]` route implemented and tested
- [ ] "Remove" action on universe table row implemented
- [ ] Confirmation dialog implemented
- [ ] Optimistic update with error recovery implemented
- [ ] 404/not-in-universe state on stock detail page for removed ticker
- [ ] Unit tests for API route passing
- [ ] Component tests for confirmation flow passing
- [ ] Manual smoke test: remove + re-add benchmark stock (TSLA or UBER)
- [ ] Traceability comments in all new files
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/PRD.md` §Monitor List Management (universe membership)
- RFC: RFC-003 §Monitor List Management UI
- Inverse operation: STORY-056 (Add Stock to Universe)
