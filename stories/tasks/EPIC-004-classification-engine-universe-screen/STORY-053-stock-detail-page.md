# STORY-053 — Stock Detail Page

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Purpose
Implement the full-page Stock Detail Screen (`/stocks/[ticker]`) as the primary drill-down view for any in-universe stock. The screen provides complete classification transparency (confidence derivation, tie-break analysis, input snapshot, E1–E6 enrichment), all fundamental metrics and flags, a valuation placeholder, and a classification history timeline. Row clicks on the Universe Screen (STORY-048) navigate here.

## Story
As a user,
I want to view the complete classification picture and fundamentals for any stock in one place,
so that I understand why a stock was classified as it was and can review its health metrics in detail.

## Outcome
A `/stocks/[ticker]` page exists behind authentication. It fetches data from `GET /api/stocks/[ticker]/detail` and renders a 4-tab layout matching the prototype (`screen-stock-detail.jsx`). The Classification tab exposes the full confidence derivation chain, tie-break analysis, input snapshot, E1–E6 scores, reason codes, and the user's override if set. The Fundamentals tab shows all growth/margin/quality/BS metrics and all 7 flags. The Valuation tab shows a placeholder panel. The History tab shows the classification history timeline.

## Scope In

### API: `GET /api/stocks/[ticker]/detail`
Comprehensive single-call endpoint returning:
- **Stock metadata:** `ticker`, `company`, `sector`, `market_cap`, `enterprise_value`
- **Classification state:** `suggested_code`, `active_code` (COALESCE override → suggested), `confidence_level`, `reason_codes`, `scores` (bucket/EQ/BS), `confidenceBreakdown`, `tieBreaksFired`, `input_snapshot`, `classified_at`
- **User override (if set):** `final_code`, `override_reason`, `overridden_at`
- **E1–E6 enrichment scores:** `e1_moat_strength`, `e2_pricing_power`, `e3_revenue_recurrence`, `e4_margin_durability`, `e5_capital_intensity`, `e6_qualitative_cyclicality`
- **Fundamental metrics:** `revenue_growth_fwd`, `eps_growth_fwd`, `revenue_growth_3y`, `eps_growth_3y`, `operating_margin`, `net_margin`, `fcf_conversion`, `roic`, `net_debt_ebitda`
- **All 7 flags:** `holding_company_flag`, `insurer_flag`, `binary_flag`, `cyclicality_flag`, `optionality_flag`, `pre_operating_leverage_flag`, `material_dilution_flag`
- **Market context:** `price`, `pe_ratio`, `ev_ebitda`
- Returns **404** when ticker is not found or not `in_universe=TRUE`

### Page: `/stocks/[ticker]`
- Next.js page at `src/app/(authenticated)/stocks/[ticker]/page.tsx`
- Authentication guard: redirect to sign-in if session absent (existing middleware)
- **Header:** ticker + company name; 3AA code badge (active_code, large); confidence badge
- **Back navigation:** "← Universe" button returns to `/universe`
- **4-tab layout:** Classification · Fundamentals · Valuation · History

### Classification Tab
- **Score bars:** horizontal bar chart for bucket scores (1–8), EQ scores (A/B/C), BS scores (A/B/C); winning score highlighted
- **Confidence derivation steps:** ordered list from `confidenceBreakdown.steps[]`; each step shows `label`, `note`, and resulting `band` pill
- **Tie-break analysis:** list from `tieBreaksFired[]`; each entry shows `rule`, `condition`, field `values` tested, `winner`, `outcome`; empty section with "No tie-breaks fired" if array empty
- **Input snapshot:** expandable section listing all `ClassificationInput` field names and their values used in last run
- **E1–E6 enrichment:** star ratings (0–5) for each score: Moat Strength (E1), Pricing Power (E2), Revenue Recurrence (E3), Margin Durability (E4), Capital Intensity (E5), Qualitative Cyclicality (E6)
- **Reason codes:** list of applied reason code strings (e.g., `cyclicality_flag_applied`, `tie_break_3v4_applied`)
- **Override section:**
  - If override set: shows `final_code`, `override_reason`, `overridden_at`, "Clear Override" button
  - If no override: "Set Override" button opens the STORY-051 modal
  - `override_scope: "display_only"` disclaimer always shown

### Fundamentals Tab
- **Growth metrics:** `revenue_growth_fwd`, `eps_growth_fwd`, `revenue_growth_3y`, `eps_growth_3y` (percentage-formatted, color-coded)
- **Profitability:** `operating_margin`, `net_margin` (percentage-formatted, color-coded)
- **Quality metrics:** `fcf_conversion`, `roic` (percentage-formatted)
- **Leverage:** `net_debt_ebitda` (×-formatted)
- **Market data:** `market_cap`, `enterprise_value`, `price`, `pe_ratio`, `ev_ebitda`
- **Color-coding thresholds (prototype `colorGrowth`, `colorDebt`, `colorFCF`):**
  - Growth fields: green ≥ 8%, yellow ≥ 3%, red < 3%
  - `net_debt_ebitda`: green ≤ 1×, yellow ≤ 2.5×, red > 2.5×
  - `fcf_conversion`: green ≥ 80%, yellow ≥ 50%, red < 50%
- **7-flag pills section:** one pill per flag; amber/red when `true`, muted green when `false`

### Valuation Tab
- Placeholder panel: "Valuation thresholds and TSR hurdles are available in a future update."
- No implementation beyond the placeholder text required in EPIC-004

### History Tab
- Timeline list from `GET /api/stocks/[ticker]/classification/history` (STORY-044/051)
- Each entry: formatted date, `old_suggested_code` → `new_suggested_code` arrow, confidence badge
- Empty state: "No classification history recorded yet."
- Related alerts placeholder: "Alert history available in a future update."

## Scope Out
- watchSignal (deferred to EPIC-006)
- Valuation threshold data and TSR hurdle (EPIC-005)
- Related alerts actual data (EPIC-006)
- Adding or removing a stock from the universe

## Dependencies
- Epic: EPIC-004
- PRD: `docs/prd/PRD.md` §Stock Detail
- RFC: RFC-001 §ClassificationResult (confidenceBreakdown, tieBreaksFired), RFC-003 §Stock Detail Screen
- ADR: ADR-013 (scoring weights); ADR-014 (confidence thresholds)
- Upstream: STORY-043 (`ClassificationResult` with `confidenceBreakdown` + `tieBreaksFired`)
- Upstream: STORY-044 (`getClassificationState`, `getClassificationHistory`)
- Upstream: STORY-045 (user override data)
- Upstream: STORY-048 (universe table rows link here)
- Upstream: STORY-051 (override modal reused here)
- Prototype: `docs/ui/project/3aa/screen-stock-detail.jsx`

## Preconditions
- `ClassificationResult` with `confidenceBreakdown` and `tieBreaksFired` populated (STORY-043)
- `getClassificationState` and `getClassificationHistory` operational (STORY-044)
- Override modal implemented (STORY-051)
- Universe Screen with row click navigation (STORY-048)

## Inputs
- URL param: `[ticker]`
- `GET /api/stocks/[ticker]/detail` response (single call, all tabs share data)
- User session (override data + auth)

## Outputs
- Rendered `/stocks/[ticker]` page with 4 tabs
- `GET /api/stocks/[ticker]/detail` API endpoint

## Acceptance Criteria
- [ ] `/stocks/[ticker]` route exists and redirects unauthenticated users to sign-in
- [ ] `GET /api/stocks/[ticker]/detail` returns 200 with full shape for a known in-universe ticker
- [ ] `GET /api/stocks/[ticker]/detail` returns 401 for unauthenticated requests
- [ ] `GET /api/stocks/[ticker]/detail` returns 404 for unknown or not-in-universe tickers
- [ ] "← Universe" back button navigates to `/universe`
- [ ] 4 tabs render without error: Classification, Fundamentals, Valuation, History
- [ ] Classification tab: active_code badge shown (override code if set, else suggested_code, else `—`)
- [ ] Classification tab: score bars render for all bucket (1–8), EQ (A/B/C), BS (A/B/C) scores
- [ ] Classification tab: confidence derivation steps rendered from `confidenceBreakdown.steps[]`
- [ ] Classification tab: tie-break analysis section renders; shows "No tie-breaks fired" when `tieBreaksFired` empty
- [ ] Classification tab: input snapshot section renders all fields with values
- [ ] Classification tab: E1–E6 star ratings render with correct labels
- [ ] Classification tab: override section shows current override details when set; shows "Set Override" button when not set
- [ ] Classification tab: `override_scope: "display_only"` disclaimer always visible
- [ ] Fundamentals tab: growth, profitability, leverage, market data metrics all shown
- [ ] Fundamentals tab: `colorGrowth` thresholds applied (green ≥ 8%, yellow ≥ 3%, red < 3%)
- [ ] Fundamentals tab: `colorDebt` thresholds applied (green ≤ 1×, yellow ≤ 2.5×, red > 2.5×)
- [ ] Fundamentals tab: `colorFCF` thresholds applied (green ≥ 80%, yellow ≥ 50%, red < 50%)
- [ ] Fundamentals tab: 7 flag pills render; amber/red when true, muted green when false
- [ ] Valuation tab: placeholder text rendered; no broken UI
- [ ] History tab: timeline list from `classification/history` rendered in `classified_at DESC` order
- [ ] History tab: empty state message shown when no history
- [ ] History tab: related alerts placeholder shown
- [ ] Bucket 8 stock: EQ/BS score bar sections hidden or labelled "N/A"
- [ ] Stock with no classification yet: Classification tab shows "No classification computed yet."

## Test Strategy Expectations

- **Unit/component tests:**
  - `<ScoreBar>` renders bar proportional to score value; highlights winning score
  - `<ConfidenceSteps>` renders correct step count; each step shows label + band pill
  - `<TieBreakList>` renders "No tie-breaks fired" when `tieBreaksFired = []`
  - `<FlagPill flag="binary_flag" value={true}>` → amber/red styling
  - `<FlagPill flag="binary_flag" value={false}>` → muted green styling
  - `<StarRating value={3.5}>` → 3.5 filled stars; `<StarRating value={0}>` → all empty
  - `<ValuationTab>` renders placeholder text without crashing
  - `<StockDetailPage>` with 404 response → renders error message, not crash

- **API integration tests:**
  - Authenticated `GET /api/stocks/MSFT/detail` → 200; shape includes `confidenceBreakdown`, `tieBreaksFired`, `input_snapshot`, all 7 flags, E1–E6 scores
  - Unauthenticated `GET /api/stocks/MSFT/detail` → 401
  - `GET /api/stocks/UNKNOWN_TICKER_XYZ/detail` → 404
  - Response shape contract: `active_code` is never missing (null acceptable for unclassified stocks)

- **E2E tests:** see STORY-052 (7th workflow: universe row click → stock detail page navigation)

## Regression / Invariant Risks
- **confidenceBreakdown null crash:** if `classifyStock` doesn't populate steps, UI crashes — explicit test for empty steps array
- **404 white-screen:** navigating to unknown ticker must show error page, not crash — 404 handling test
- **Tab data sharing:** switching tabs must not trigger redundant API calls — single fetch verified in tests
- **Override reflected in universe:** clearing override from detail page should be visible when navigating back — explicit UI state test

## Key Risks / Edge Cases
- **No classification yet:** `suggested_code = null`, `confidenceBreakdown` may be empty or absent — render "No classification computed yet." gracefully
- **Bucket 8 stock:** `eq_grade = null`, `bs_grade = null`; EQ/BS score bar sections hidden or show "N/A"
- **All flags false:** flag pills section still renders (all green pills); empty section must not occur
- **No history rows:** history tab shows empty state cleanly

## Definition of Done
- [ ] `GET /api/stocks/[ticker]/detail` endpoint implemented at `src/app/api/stocks/[ticker]/detail/route.ts`
- [ ] `/stocks/[ticker]` page implemented at `src/app/(authenticated)/stocks/[ticker]/page.tsx`
- [ ] All 4 tabs implemented (Valuation tab as placeholder)
- [ ] `<ScoreBar>`, `<ConfidenceSteps>`, `<TieBreakList>`, `<FlagPill>`, `<StarRating>` components implemented and unit-tested
- [ ] API integration tests: 200 happy path, 401, 404
- [ ] Visual check: all 4 tabs render correctly in dev browser; back navigation works
- [ ] Traceability comments reference PRD §Stock Detail, RFC-001 §ClassificationResult, RFC-003 §Stock Detail Screen
- [ ] No new TypeScript compilation errors
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- PRD: `docs/prd/PRD.md` §Stock Detail
- RFC: RFC-001 §ClassificationResult; RFC-003 §Stock Detail Screen
- ADR: ADR-013 (scoring weights); ADR-014 (confidence thresholds)
- Prototype: `docs/ui/project/3aa/screen-stock-detail.jsx`
