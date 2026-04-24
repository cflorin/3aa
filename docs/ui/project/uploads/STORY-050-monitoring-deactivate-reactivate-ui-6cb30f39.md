# STORY-050 — Monitoring: Deactivate/Reactivate UI

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the UI controls for toggling stock monitoring status per-user. Since all stocks are monitored by default, this UI allows a user to deactivate specific stocks (stop receiving alerts) and reactivate them at any time. Controls appear on each row of the universe screen table.

## Story
As a user,
I want to deactivate stocks I don't want to be alerted on, and reactivate them later,
so that I control my alert noise without losing visibility of any stock in the universe.

## Outcome
Each universe screen table row has a monitoring toggle (button/switch). Deactivating a stock calls `PUT /api/stocks/[ticker]/monitoring { is_active: false }` and updates the row badge. Reactivating calls the same endpoint with `{ is_active: true }`. The change is optimistic. The `Inactive` filter in STORY-049 lets users view all deactivated stocks.

## Scope In
- Per-row monitoring toggle in universe screen table:
  - Active stocks: show "Deactivate" button (or icon toggle)
  - Inactive stocks: show "Reactivate" button; row visually muted (e.g., lighter text)
- Clicking "Deactivate" → inline confirmation: "Stop monitoring this stock? You won't receive alerts for it." + Confirm / Cancel
- Confirming deactivation → `PUT /api/stocks/[ticker]/monitoring { is_active: false }` → row badge changes to `Inactive`
- Clicking "Reactivate" → no confirmation needed (reactivation is low-risk) → immediate `PUT { is_active: true }` → `Inactive` badge clears
- Optimistic UI: row updates immediately; if API fails → revert + error toast
- Bulk deactivation: out of V1 scope (individual toggle only)

## Scope Out
- "Remove from universe" (stocks cannot be removed from the universe via UI; universe is managed by the pipeline)
- CSV import / bulk add (out of V1 scope — universe built by EPIC-003 pipeline)
- "Pause" monitoring with scheduled resume date (out of V1 scope)
- Bulk deactivation (out of V1 scope)

## Dependencies
- Epic: EPIC-004
- PRD: `docs/prd/PRD.md` §Screen 2 — Monitor List Management
- RFC: RFC-003 §Monitor List Management UI (model updated: deactivate/reactivate, not add/remove)
- Upstream: STORY-046 (`PUT /api/stocks/[ticker]/monitoring`)
- Upstream: STORY-048 (universe screen table — toggle integrated into each row)

## Preconditions
- Universe screen table rendered (STORY-048)
- `PUT /api/stocks/[ticker]/monitoring` operational (STORY-046)

## Inputs
- User click on deactivate / reactivate toggle per row
- Confirmation click (for deactivation only)

## Outputs
- API call to `PUT /api/stocks/[ticker]/monitoring`
- Optimistic row update (badge change, row muting for inactive stocks)

## Acceptance Criteria
- [ ] Each table row shows monitoring toggle (Deactivate or Reactivate based on `is_active`)
- [ ] Active stock "Deactivate" click → inline confirmation shown
- [ ] Confirming deactivation → `PUT { is_active: false }` called → row updates to `Inactive` badge
- [ ] Cancelling deactivation → no change
- [ ] Inactive stock "Reactivate" click → immediate `PUT { is_active: true }` → `Inactive` badge clears
- [ ] Optimistic update: row changes immediately; if API error → revert + error toast
- [ ] Inactive rows are visually distinguished (muted text or row styling)
- [ ] After deactivation, stock remains visible in table (not hidden)
- [ ] Filter "Inactive only" (STORY-049) shows deactivated stocks

## Test Strategy Expectations
- **Unit/component tests:**
  - Active row: "Deactivate" button visible; "Reactivate" not visible
  - Inactive row: "Reactivate" button visible; row has inactive styling; "Inactive" badge present
  - Deactivate click: inline confirmation shown; cancel → hidden
  - Reactivate: no confirmation; immediate state change
- **Integration tests:**
  - Click deactivate → confirm → API called with `{ is_active: false }` → row updates
  - Click reactivate → API called with `{ is_active: true }` → badge clears
  - API error on deactivate → row reverts to active, error shown
- **E2E tests:** see STORY-052

## Regression / Invariant Risks
- **Deactivated stock disappears:** stock must remain visible after deactivation (only badge changes) — integration test
- **Optimistic update lost:** error handler must revert row state — error scenario test

## Key Risks / Edge Cases
- **Slow API:** toggle should show loading state; user should not be able to double-click
- **All stocks deactivated:** valid state; all rows show `Inactive`; table remains populated

## Definition of Done
- [ ] Monitoring toggle implemented on each universe screen table row
- [ ] Inline confirmation for deactivation implemented
- [ ] Optimistic update with error recovery implemented
- [ ] Unit/component tests for toggle states and confirmation
- [ ] Integration tests for deactivate/reactivate lifecycle
- [ ] Inactive row visual distinction implemented and tested
- [ ] Traceability comments reference PRD §Monitor List Management, RFC-003
- [ ] No new TypeScript compilation errors
- [ ] Visual check: toggle and confirmation work correctly in dev browser
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/PRD.md` §Screen 2 — Monitor List Management
- RFC: RFC-003 §Monitor List Management UI
- ADR: ADR-007 (per-user stock monitoring state)
