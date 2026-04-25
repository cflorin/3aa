# STORY-079 — Stock Detail Page: Valuation Tab

## Epic
EPIC-005 — Valuation Threshold Engine & Enhanced Universe

## Purpose
Implement the Valuation tab on the Stock Detail page, displaying the computed valuation zone, current multiple, thresholds, TSR hurdle, and secondary adjustment flags. Also provides a user interface to enter manual threshold overrides and (for holding companies) the `forward_operating_earnings_ex_excess_cash` input.

## Story
As an authenticated user viewing a stock's detail page,
I want to see the stock's current valuation zone, primary metric, thresholds, and TSR hurdle,
so that I can immediately understand whether the stock is attractively or unattractivelly priced relative to the framework.

## Outcome
The "Valuation" tab on the Stock Detail page (`src/app/(authenticated)/stocks/[ticker]/page.tsx` + a new `ValuationTab` component) displays all `ValuationState` fields with correct labels, zone badge, threshold gauge, TSR hurdle, secondary adjustment indicators, and — when status is not `ready` — a descriptive status message. A collapsible override panel allows threshold or metric input.

## Scope In
- `ValuationTab` component: `src/components/stocks/ValuationTab.tsx`
- Data fetching via `GET /api/stocks/[ticker]/valuation` (STORY-078); uses `userResult` for all display (personalized: uses `final_code` if user has classification override, and user threshold/metric overrides applied in-memory); shows `systemState` zone in a secondary "System view" tooltip when `hasUserOverride=true`
- Display sections:
  - **Status badge**: `ready` (green), `manual_required` (amber), `manual_required_insurer` (amber), `classification_required` (grey), `not_applicable` (grey), `missing_data` (red)
  - **Metric row**: primary metric label, `current_multiple` with `current_multiple_basis` annotation, metric reason
  - **Threshold gauge**: four horizontal threshold lines (steal / very_good / comfortable / max) with current multiple plotted; zone label highlights the active band; `threshold_source` label (`anchored` | `derived from {derivedFromCode}` | `manual override`)
  - **TSR hurdle row**: base hurdle label + %, adjusted hurdle %, reason codes as chips
  - **Secondary adjustments**: gross margin adjustment badge (if applied), dilution adjustment badge (if applied), cyclicality context chip
  - **Override panel** (collapsible, "Edit Overrides" button): threshold override fields (4 inputs), primary metric override selector, `forward_operating_earnings_ex_excess_cash` input (shown only for holding company/insurer stocks), notes textarea, Save / Clear buttons
  - **Valuation History** section: last 10 zone transitions in reverse-chronological table (date, old zone, new zone, change reason)
- Non-`ready` status: show status badge + explanation paragraph; hide gauge if thresholds null; still show history if exists
- B8 stocks: show `not_applicable` status; hide metric/gauge/hurdle sections

## Scope Out
- Universe-level zone column — STORY-080
- Real-time price updates (static snapshot from last batch run)
- Export/print

## Dependencies
- STORY-075–078 (all backend valuation APIs must exist)
- STORY-053 (Stock Detail Page tab structure — Valuation tab already listed as one of 4 tabs)
- STORY-054 (dark terminal theme — component must follow existing theme conventions)

## Preconditions
- GET `/api/stocks/[ticker]/valuation` returns `{ state, userOverride }` (STORY-078)
- Stock Detail page exists at `src/app/(authenticated)/stocks/[ticker]/page.tsx`
- Dark theme Tailwind classes established in codebase

## UI Specifications

### Valuation Zone Badge Colors
| Zone | Color |
|------|-------|
| steal_zone | emerald-400 |
| very_good_zone | green-400 |
| comfortable_zone | yellow-400 |
| max_zone | orange-400 |
| above_max | red-400 |
| not_applicable | zinc-500 |

### Threshold Gauge
Horizontal bar scaled to multiples range. Threshold lines labeled with value (e.g., "16.0x steal"). Current multiple shown as vertical line with label. Zone band highlighted.

### TSR Hurdle Reason Codes
Short labels: `EQ-A`, `EQ-C`, `BS-A`, `BS-C`, `B8-null` — displayed as small chips.

### Override Panel Behavior
- Threshold inputs: all 4 shown together; submit disabled unless all 4 filled or all 4 empty
- Saves immediately on "Save"; triggers recompute and refreshes state display
- "Clear Overrides" → DELETE endpoint → refreshes
- `forward_operating_earnings_ex_excess_cash` shown only when `holding_company_flag=true` OR `insurer_flag=true`

## Acceptance Criteria
- [ ] Valuation tab renders correct zone badge for each of the 6 possible status values
- [ ] Threshold gauge renders when all 4 thresholds are non-null
- [ ] Gauge hides (replaced by "—") when thresholds are null (not_applicable, missing_data)
- [ ] `threshold_source` displayed: "Anchored", "Derived from {code}", or "Manual Override"
- [ ] TSR hurdle row shows base label + %, adjusted %, reason code chips
- [ ] Gross margin and dilution adjustment badges shown/hidden correctly per `ValuationState` flags
- [ ] Override panel: Save with valid 4 thresholds → PUT request → state refreshes
- [ ] Override panel: Save with `forwardOperatingEarningsExExcessCash` for holding company → state refreshes
- [ ] Override panel: Clear → DELETE request → state reverts to system values
- [ ] Validation errors from API (threshold order) shown inline
- [ ] Valuation history section shows up to 10 rows, newest first
- [ ] B8 stock: shows "Not Applicable — Bucket 8 stocks do not receive a valuation zone" message
- [ ] `manual_required` status: shows explanation "Primary metric unavailable; manual threshold input required"
- [ ] Component follows dark terminal theme (zinc background, monospace font, existing theme conventions)
- [ ] No hydration errors (SSR-safe)

## Test Strategy Expectations
- Unit tests (component, mocked API responses):
  - Status badge renders correct color/label for each of 6 statuses
  - Gauge renders when thresholds present; hides when null
  - History table renders 10 rows sorted newest-first
  - Override form: submit disabled with partial threshold fill; enabled with all 4; success clears form
  - `forward_operating_earnings_ex_excess_cash` field only visible for holding/insurer stocks
- E2E tests (Playwright against real dev DB):
  - Navigate to stock with `ready` state → zone badge, gauge, hurdle visible
  - Enter override thresholds → zone updates in tab
  - Clear overrides → original zone restored
  - Navigate to B8 stock → not_applicable message, no gauge

## Regression / Invariant Risks
- Tab must not break existing Classification / Fundamentals / History tabs (STORY-053)
- Override form must not submit unless all 4 thresholds OR none (partial = client-side block before API call)

## Definition of Done
- [ ] `src/components/stocks/ValuationTab.tsx` implemented
- [ ] Valuation tab wired into stock detail page
- [ ] Unit + E2E tests passing
- [ ] Dark theme applied throughout
- [ ] Implementation log updated
- [ ] Traceability comments (`// EPIC-005: ... STORY-079: ...`)

## Traceability
- Epic: EPIC-005 — Valuation Threshold Engine & Enhanced Universe
- PRD: `docs/prd/3_aa_valuation_threshold_workflow_prd_v_1.md` §US-VAL-001, §US-VAL-002, §US-VAL-004, §US-VAL-005, §US-VAL-006
- RFC: RFC-003 — Valuation & Threshold Engine Architecture §Valuation UI
- STORY-053: Stock Detail Page (tab structure already established)
- STORY-078: User Valuation Override API (data source for override panel)
