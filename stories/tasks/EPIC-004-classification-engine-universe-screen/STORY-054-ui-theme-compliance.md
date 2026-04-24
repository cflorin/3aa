# STORY-054: UI Theme Compliance — Dark Terminal Theme

**Epic:** EPIC-004 — Classification Engine & Universe Screen  
**Story:** STORY-054  
**Status:** in_progress  
**Priority:** Critical  
**Registered:** 2026-04-24  
**Bug registry:** `docs/bugs/UI-BUG-REGISTRY.md` (BUG-001 through BUG-017)

---

## Problem Statement

The deployed application has no styling — it renders with white backgrounds, black text, and default HTML form controls. The spec (`docs/ui/project/3aa/`) mandates a dark terminal theme (near-black backgrounds, cyan accent `#2dd4bf`, `DM Sans`/`DM Mono` fonts, sidebar navigation). Every screen deviates from spec.

---

## Acceptance Criteria

1. **Dark terminal theme applied globally** — page background `#0b0d11`, text `#d4d8e0`, accent `#2dd4bf`, all surfaces per spec T tokens
2. **DM Sans + DM Mono fonts loaded** — DM Sans for body, DM Mono for tickers/codes/numbers
3. **Sidebar navigation** — 200px fixed left sidebar with logo, nav links (Universe active), user section
4. **Universe screen** — filter bar embedded in header row, dark inputs, correct select controls, dark table, sticky headers, dark pagination
5. **Sign-in screen** — dark card form, accent logo square, correct input styling, accent CTA button
6. **Stock detail screen** — dark header bar, tab bar with accent underline, all sub-components (ScoreBar, StarRating, FlagPill, ConfidenceSteps, TieBreakList) in dark theme
7. **All badges** — ClassificationBadge, ConfidenceBadge, MonitoringToggle styled to spec

---

## Tasks

| Task | Description | Status |
|------|-------------|--------|
| TASK-054-001 | Theme constants + global CSS + fonts | done |
| TASK-054-002 | Authenticated layout with Sidebar component | done |
| TASK-054-003 | Sign-in page dark theme | done |
| TASK-054-004 | Universe page + FilterBar dark theme | done |
| TASK-054-005 | StockTable + PaginationControls dark theme | done |
| TASK-054-006 | Badge components dark theme (Classification, Confidence, Monitoring) | done |
| TASK-054-007 | Stock detail + all sub-components dark theme | done |

---

## Spec References

- Theme tokens: `docs/ui/project/3aa/app.jsx` lines 4-19
- Shared components: `docs/ui/project/3aa/components.jsx`
- Universe screen: `docs/ui/project/3aa/screen-universe.jsx`
- Stock detail screen: `docs/ui/project/3aa/screen-stock-detail.jsx`
- Sign-in screen: `docs/ui/project/3aa/screen-other.jsx`
