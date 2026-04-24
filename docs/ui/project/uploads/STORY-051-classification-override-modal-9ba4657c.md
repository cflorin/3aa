# STORY-051 — Classification Override Modal

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the classification override modal — the UI that lets a user inspect the full classification details for a stock (system scores, reason codes, confidence breakdown, classification history) and optionally record their own 3AA code. This is the primary user-facing surface for interacting with the classification engine output.

## Story
As a user,
I want to open a detailed classification view for any stock and optionally set my own classification code,
so that I can understand the system's reasoning, review how the classification has changed over time, and record my personal assessment.

## Outcome
Clicking a stock's 3AA code badge in the universe table opens a modal showing: system suggested code, confidence, bucket scores, EQ/BS scores, reason codes, classification history, and the user's current override. The user can set or clear their override with a required reason. The table badge updates after save.

## Scope In
- Trigger: clicking the `<ClassificationBadge>` component in any universe screen table row opens the modal
- Modal sections:
  1. **Stock header:** ticker, company name, sector
  2. **Active code:** large display of `active_code` (user override if set, else system; labeled accordingly)
  3. **System suggestion:** `system_suggested_code`, confidence badge, `classified_at` timestamp
  4. **Score breakdown:** visual display for each bucket score (1–8); winning bucket highlighted
  5. **Quality scores:** EQ grades A/B/C with scores; BS grades A/B/C with scores
  6. **Reason codes:** chip/tag list of all fired reason codes
  7. **Classification history section:**
     - Timeline of previous system `suggested_code` changes from `classification_history` table
     - Each entry: `classified_at`, `previous_code → new_code`
     - Ordered most-recent first; limit 10 entries
     - Empty state: "No classification history yet."
  8. **User override section:**
     - If override active: shows current override code + override_reason + "Clear override" button
     - If no override: "Set my classification" with a code selector, required reason text (min 10 chars) + "Save" button
     - `override_scope: "display_only"` disclaimer always visible: "Your override affects display only — alerts use the system classification."
- `GET /api/stocks/[ticker]/classification` called when modal opens
- `GET /api/stocks/[ticker]/classification/history` endpoint added (returns `ClassificationHistory[]`): `{ classified_at, previous_code, suggested_code }[]`
- `POST /api/classification-override` called on save; `DELETE /api/classification-override/[ticker]` called on clear
- Optimistic update: badge in table updates immediately after save/clear
- Error state: if API fails, show inline error, revert badge
- Modal accessible: focus trap, ESC to close, `aria-modal="true"`, `role="dialog"`

## Scope Out
- Bulk override operations
- Admin override capabilities
- Editing the system's classification rules from the UI

## Dependencies
- Epic: EPIC-004
- PRD: `docs/prd/PRD.md` §Screen 2 — Classification Detail, §Override UI
- RFC: RFC-003 §Classification Override Modal; RFC-001 §ClassificationResult
- Upstream: STORY-044 (`classification_history` table and `getClassificationHistory`)
- Upstream: STORY-045 (`GET /api/stocks/[ticker]/classification`, `POST /api/classification-override`, `DELETE /api/classification-override/[ticker]`)
- Upstream: STORY-048 (universe screen table and `<ClassificationBadge>` trigger)

## Preconditions
- `GET /api/stocks/[ticker]/classification` operational (STORY-045)
- `POST /api/classification-override` and `DELETE /api/classification-override/[ticker]` operational (STORY-045)
- `classification_history` table operational (STORY-044)
- Universe screen table rendered (STORY-048)

## Inputs
- `ticker` (from clicked row)
- `GET /api/stocks/[ticker]/classification` response
- `GET /api/stocks/[ticker]/classification/history` response

## Outputs
- Rendered modal with full classification detail and history
- Optional `POST /api/classification-override` on save
- Optional `DELETE /api/classification-override/[ticker]` on clear
- Updated `<ClassificationBadge>` in table after override change

## Acceptance Criteria
- [ ] Clicking a classification badge opens the modal for that stock
- [ ] Modal shows system suggested code and confidence badge
- [ ] Modal shows all 8 bucket scores with winning bucket highlighted
- [ ] Modal shows EQ scores (A/B/C) and BS scores (A/B/C)
- [ ] Modal shows reason codes as chips/tags
- [ ] **History section present:** shows up to 10 most recent system code changes with timestamps
- [ ] History empty state: "No classification history yet." shown when no rows
- [ ] `GET /api/stocks/[ticker]/classification/history` endpoint returns history rows
- [ ] User with no override sees "Set my classification" form
- [ ] Override form has required reason field (min 10 chars); Save button disabled until valid
- [ ] User with existing override sees current code + reason + "Clear override" button
- [ ] Saving valid override (code + reason ≥ 10 chars) → table badge updates to override code
- [ ] Saving with reason < 10 chars → inline validation error, no API call
- [ ] Clearing override → table badge reverts to system suggested code
- [ ] API failure on save → inline error, badge reverted
- [ ] `override_scope: "display_only"` disclaimer visible in modal
- [ ] ESC key closes modal; focus returns to trigger element
- [ ] Focus trapped within modal when open
- [ ] `aria-modal="true"`, `role="dialog"`, accessible label on modal root

## Test Strategy Expectations
- **Unit/component tests:**
  - `<ClassificationModal>` with no override → "Set my classification" form visible
  - `<ClassificationModal>` with override → override code + reason shown, "Clear override" visible
  - Reason validation: `"Too short"` (9 chars) → Save button disabled / inline error
  - Reason validation: `"My thesis here"` (14 chars) → Save button enabled
  - Reason validation: empty string → error
  - Bucket score display: bucket 4 highest → bucket 4 bar highlighted
  - History section with 3 entries → 3 timeline rows
  - History section with 0 entries → "No classification history yet."
  - Override scope disclaimer: always visible in the override section
- **Integration tests:**
  - Click badge → GET classification + history → modal renders with correct data
  - Save override (valid code + reason) → POST called with correct body → table badge updates
  - Clear override → DELETE called → badge reverts to system code
  - API failure on save → badge unchanged, error message shown
  - History endpoint: `GET /api/stocks/[ticker]/classification/history` returns ordered history
- **Accessibility tests:**
  - Modal has `role="dialog"` and `aria-modal="true"`
  - Focus returns to trigger element after close
  - ESC key closes modal
- **E2E tests:** see STORY-052

## Regression / Invariant Risks
- **override_scope disclaimer removed:** if the "display only" note is removed without EPIC-006 being updated, users may expect alerts to use their override — keep disclaimer in UI; fail CI if text is missing
- **Reason validation bypassed:** if min-length check is removed, empty reasons are saved — zero-length reason test on every build
- **Focus trap regression:** accessibility test must run in CI
- **History section missing:** if history API is not called, section silently omits data — integration test verifies history rows loaded

## Key Risks / Edge Cases
- **`system_suggested_code = null`:** modal shows "System classification pending" not crash
- **Empty reason_codes:** render "No reason codes available", not empty chip area
- **Very long classification history:** capped at 10 entries in GET; no infinite scroll needed in V1
- **Override code same as system code:** valid — user explicitly agrees; override_scope disclaimer still shown

## Definition of Done
- [ ] `<ClassificationModal>` component implemented with all 8 sections including history
- [ ] `GET /api/stocks/[ticker]/classification/history` endpoint implemented
- [ ] Modal trigger wired to `<ClassificationBadge>` in universe screen table
- [ ] Save and clear override flows with optimistic update
- [ ] Reason validation (required, min 10 chars) enforced in UI before API call
- [ ] Unit/component tests for modal sections, validation, and history
- [ ] Integration tests for badge click → render, save/clear → API flows, history loading
- [ ] Accessibility tests: role, aria-modal, focus trap, ESC
- [ ] `override_scope: "display_only"` disclaimer present and tested
- [ ] Traceability comments reference PRD §Override UI, RFC-003 §Classification Override Modal
- [ ] No new TypeScript compilation errors
- [ ] Visual check: modal renders fully with history and override form in dev browser
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/PRD.md` §Screen 2 — Classification Detail, §Override UI
- RFC: RFC-003 §Classification Override Modal; RFC-001 §ClassificationResult
- ADR: ADR-007 (user override semantics — display only in V1)
