# STORY-086: Recompute Valuations — Admin API & Universe Screen Button

**Epic:** EPIC-005 — Valuation Threshold Engine & Enhanced Universe
**Status:** done
**Priority:** P1 — developer utility; enables on-demand valuation refresh after algorithm or data changes

---

## Background

After a classification recompute or quarterly history sync, valuation zones may become stale. STORY-086 provides a session-authenticated (and OIDC-authenticated) REST endpoint and a UI button that triggers a full forced valuation recompute for all in-universe stocks, then refreshes the Zone column in the universe list.

The route also supports external callers (scripts, Cloud Scheduler) via OIDC Bearer token — same dual-auth pattern as other admin endpoints. Optional `?force` (default `true`) and `?ticker` params allow single-stock mode.

---

## Acceptance Criteria

### AC-1: Button visible next to Recompute Classification
Given the user is on the Universe Screen, a "Recompute Valuations" button appears next to the "Recompute Classification" button.

### AC-2: Button triggers full valuation recompute
When the user clicks "Recompute Valuations" and the API succeeds, `runValuationBatch({ force: true })` runs and the universe list refreshes with updated Zone values.

### AC-3: Loading state while running
While the request is in-flight, the button shows "Recomputing…" and is disabled.

### AC-4: Success feedback
On completion, the button shows "✓ Done" and an inline message shows "N updated, S skipped" (plus error count if > 0). Auto-resets to idle after 5 seconds.

### AC-5: Error feedback
On API failure, a red error message appears below the button and the button re-enables.

### AC-6: Session-authenticated request accepted
`POST /api/admin/sync/valuation` with a valid `sessionId` cookie returns `200` with `ValuationBatchSummary` JSON `{ total, updated, skipped, errors, duration_ms }`.

### AC-7: OIDC Bearer token accepted (external callers)
`POST /api/admin/sync/valuation` with a valid OIDC `Authorization: Bearer <token>` returns `200`. Enables scripts and Cloud Scheduler to trigger on-demand recomputes.

### AC-8: Unauthenticated request rejected
`POST /api/admin/sync/valuation` with no session and no valid Bearer token returns `401`.

### AC-9: Optional params
`?force=false` disables forced recompute (skips unchanged stocks). `?ticker=AAPL` limits to a single stock.

---

## Tasks

- [x] TASK-086-001: `POST /api/admin/sync/valuation` route (dual-auth: session OR OIDC bearer token)
- [x] TASK-086-002: `RecomputeValuationButton` React component (loading/success/error states)
- [x] TASK-086-003: Wire into `FilterBar` (`onRecomputeValuation` prop) and `UniversePageClient` (`refreshKey` trigger)
- [x] TASK-086-004: Unit tests — route (11 tests), component (8 tests), FilterBar (5 tests); 24 total
- [x] TASK-086-005: Story file, implementation plan, implementation log updated

---

## Files Changed

```
src/app/api/admin/sync/valuation/route.ts              [NEW]
src/components/universe/RecomputeValuationButton.tsx   [NEW]
src/components/universe/FilterBar.tsx                  [MODIFIED — onRecomputeValuation prop]
src/components/universe/UniversePageClient.tsx         [MODIFIED — handleRecomputeValuation + prop wire]
tests/unit/api/admin-sync-valuation.test.ts            [NEW — 11 tests]
tests/unit/components/RecomputeValuationButton.test.tsx [NEW — 8 tests]
tests/unit/components/story-086-recompute-valuation.test.tsx [NEW — 5 tests]
```

---

## API Reference

```
POST /api/admin/sync/valuation

Auth:    sessionId cookie  OR  Authorization: Bearer <OIDC token>
Params:  ?force=true|false  (default: true)
         ?ticker=AAPL        (optional — single-stock mode)

200 OK:  { total, updated, skipped, errors, duration_ms }
401:     { error: 'Unauthorized' }
500:     { error: 'Internal server error' }
```
