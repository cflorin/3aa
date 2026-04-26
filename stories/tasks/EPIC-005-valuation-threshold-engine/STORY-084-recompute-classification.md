# STORY-084: Recompute Classification — Admin API & Universe Screen Button

**Epic:** EPIC-005 — Valuation Threshold Engine & Enhanced Universe
**Status:** done
**Priority:** P1 — developer utility for algorithm iteration

---

## Background

During classification algorithm development, re-running classification against all in-universe stocks is a frequent operation. Previously this required either waiting for the nightly cron or calling the OIDC-protected `/api/cron/classification` endpoint directly. STORY-084 provides a session-authenticated REST endpoint and a UI button that triggers a full forced re-classification of all in-universe stocks and refreshes the universe list.

---

## Acceptance Criteria

### AC-1: Button visible next to Add Stock
Given the user is on the Universe screen, a "Recompute Classification" button appears next to the "+ Add Stock" button.

### AC-2: Button triggers re-classification
When the user clicks "Recompute Classification" and the API succeeds, all in-universe stocks are re-classified with `force=true` and the universe list refreshes with updated codes and confidence levels.

### AC-3: Loading state while running
While the request is in-flight, the button shows "Recomputing…" and is disabled.

### AC-4: Success feedback
On completion, the button shows "✓ Done" and an inline message shows "N reclassified, S skipped" (plus error count if > 0). Auto-resets to idle after 5 seconds.

### AC-5: Error feedback
On API failure, a red error message appears below the button and the button re-enables.

### AC-6: API accessible via session cookie
`POST /api/admin/sync/classification` with a valid `sessionId` cookie returns `200` with `BatchSummary` JSON `{ processed, recomputed, skipped, errors, duration_ms }`.

### AC-7: Unauthenticated request rejected
`POST /api/admin/sync/classification` with no or invalid session returns `401`.

---

## Tasks

- [x] TASK-084-001: `POST /api/admin/sync/classification` route (session auth, calls `runClassificationBatch({ force: true })`)
- [x] TASK-084-002: `RecomputeClassificationButton` React component (loading/success/error states)
- [x] TASK-084-003: Wire into `FilterBar` (`onRecomputeClassification` prop) and `UniversePageClient` (`refreshKey` trigger)
- [x] TASK-084-004: Unit tests — route (7 tests), component (7 tests), FilterBar (4 tests); 18 total
- [x] TASK-084-005: Story file, implementation plan, implementation log updated

---

## Files Changed

```
src/app/api/admin/sync/classification/route.ts          [NEW]
src/components/universe/RecomputeClassificationButton.tsx [NEW]
src/components/universe/FilterBar.tsx                   [MODIFIED]
src/components/universe/UniversePageClient.tsx          [MODIFIED]
tests/unit/api/admin-sync-classification.test.ts        [NEW]
tests/unit/components/RecomputeClassificationButton.test.tsx [NEW]
tests/unit/components/story-084-recompute-classification.test.tsx [NEW]
```
