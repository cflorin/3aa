# STORY-095 — Stock Detail Page: Regime & Cyclicality Display

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Surface `valuation_regime`, growth tier, cycle position, and cyclical overlay on the Stock Detail Valuation tab. Users need to understand _why_ a stock has the thresholds it does — regime and cyclicality data provide that explanation. Also adds `valuation_regime` filter to the Universe Screen.

## Story
As a user,
I want to see the assigned valuation regime and cyclical overlay details on the Stock Detail Valuation tab,
so that I understand why the thresholds are set where they are and can verify the framework is treating the stock correctly.

## Outcome
- Valuation tab shows `valuation_regime` with a human-readable description
- For `profitable_growth_pe`: shows growth tier and base thresholds before overlay
- For cyclical stocks: shows `cycle_position`, `cyclical_overlay_value`, `cyclical_confidence`
- For `manual_required` (bank/financial_special_case): shows explanation of why automated valuation is blocked
- Universe Screen: `valuation_regime` column and filter added

## Scope In

### Stock Detail — Valuation Tab: Regime section

New section "Valuation Regime" added above the threshold gauge:

**All regimes:**
- Regime badge: styled chip with regime name + one-line description (from a regime description map)
- Regime description map:

| Regime | Display name | One-line description |
|---|---|---|
| `profitable_growth_pe` | Profitable Growth (P/E) | High-margin, high-FCF, profitable compounder |
| `mature_pe` | Mature PE | Profitable, stable, below-20% growth |
| `cyclical_earnings` | Cyclical Earnings (EV/EBIT) | Earnings-driven cyclical; cycle-adjusted thresholds |
| `profitable_growth_ev_ebit` | Transitional Growth (EV/EBIT) | Profitable transitional; EV/EBIT regime |
| `sales_growth_standard` | Sales Growth | Pre-earnings; revenue-based valuation |
| `sales_growth_hyper` | Hyper Growth | Hyper-growth SaaS/tech; 40%+ revenue growth |
| `financial_special_case` | Financial Special Case | Insurer or holding company; normalised operating earnings |
| `manual_required` | Manual Required | Outside automated framework; manual inputs needed |
| `not_applicable` | Not Applicable | Binary/lottery — no valuation metric applies |

**For `profitable_growth_pe`:** Show growth tier sub-section:
- Growth tier badge: `high` / `mid` / `standard` with growth range label
- Base thresholds for this tier (before quality downgrade and cyclical overlay)
- If cyclical overlay applied: show "Cyclical overlay: −X turns (score Y, position Z)"

**For `cyclical_earnings` and `profitable_growth_pe` with score ≥ 1:** Show cyclicality sub-section:
- `structural_cyclicality_score`: 0–3 with description (0=stable, 1=mild, 2=moderate, 3=high)
- `cycle_position`: badge with color coding (depressed=blue, normal=grey, elevated=yellow, peak=red, insufficient_data=grey-italic)
- `cyclical_overlay_value`: if non-null, show "−X turns applied"
- `cyclical_confidence`: high/medium/low/insufficient_data with tooltip explanation

**For `manual_required`:** Show explanation block:
- If `bank_flag = true`: "This stock is a bank or financial institution. EV/EBIT is not meaningful for banks; P/E requires loan-loss normalisation beyond the framework's scope. Valuation must be set manually."
- If `financial_special_case`: "This stock is an insurer or holding company. Metric type: Forward operating earnings ex excess cash. Thresholds must be set manually after providing normalised earnings."
- Other manual_required: "Automated metric selection is not possible for this stock. Use the override panel to set a manual multiple and thresholds."

### Universe Screen: Regime column + filter

**Column:** `Regime` — shows regime badge (abbreviated, same color scheme)

**Filter:** `valuation_regime` multi-select (all 9 values with display names)

### API changes

The existing Stock Detail API (`GET /api/stocks/[ticker]/valuation`) must return new fields:
- `valuationRegime`
- `growthTier`
- `structuralCyclicalityScoreSnapshot`
- `cyclePositionSnapshot`
- `cyclicalOverlayApplied`
- `cyclicalOverlayValue`
- `cyclicalConfidence`
- `thresholdFamily`

The Universe Screen API must support `valuation_regime` as a filter parameter.

## Scope Out
- Manual threshold entry UI for `financial_special_case` — uses existing override panel
- `structural_cyclicality_score` history chart — post-V1
- Editing bank_flag — out of scope (framework flag, not user-settable)

## Dependencies
- STORY-094 ✅ (regime + cyclical fields in DB)
- STORY-079 ✅ (Valuation tab exists)
- STORY-080 ✅ (Universe Screen valuation columns exist)

## Preconditions
- Valuation batch has run post-STORY-094; `valuation_regime` populated on test stocks
- Valuation tab components exist (`src/app/(authenticated)/stocks/[ticker]/`)

## Tasks

### TASK-095-001: Valuation API — add new fields to GET response
- File: `src/app/api/stocks/[ticker]/valuation/route.ts`
- Include all 8 new `valuation_state` fields in response
- No auth change needed (existing route protection applies)

### TASK-095-002: Regime badge component
- `src/components/valuation/RegimeBadge.tsx`
- Accepts `regime: ValuationRegime`
- Renders styled chip with display name + hover tooltip showing one-line description
- Color scheme: green=pe_growth, blue=mature, amber=cyclical, purple=sales, grey=manual/na

### TASK-095-003: Valuation tab — regime section
- In `src/app/(authenticated)/stocks/[ticker]/valuation/` (or equivalent component):
- Add "Valuation Regime" section above threshold gauge
- Regime badge
- Cyclicality sub-section (conditional: only for cyclical_earnings or profitable_growth_pe with score≥1)
- Growth tier sub-section (conditional: only for profitable_growth_pe)
- Manual required explanation (conditional: manual_required + financial_special_case)

### TASK-095-004: Cycle position badge component
- `src/components/valuation/CyclePositionBadge.tsx`
- Color-coded: depressed=steel-blue, normal=grey, elevated=amber, peak=red, insufficient_data=muted-grey

### TASK-095-005: Universe Screen — regime column + filter
- Add `Regime` column to universe stock table
- Add `valuation_regime` filter (multi-select) to filter panel
- Connect to existing filter infrastructure
- Update API handler to accept `regime` query param

### TASK-095-006: Visual regression check
- Manually test Stock Detail Valuation tab for 4 stocks:
  - NVDA (profitable_growth_pe, cyclical overlay)
  - WMT (mature_pe, no overlay)
  - One bank stock (manual_required, bank explanation)
  - One holding company (financial_special_case)
- Verify: no layout regressions on existing valuation tab elements

## Acceptance Criteria
- [ ] Regime badge renders correctly for all 9 regime values
- [ ] NVDA-like stock: shows "Profitable Growth (P/E)", growth tier, cyclical overlay section
- [ ] WMT-like stock: shows "Mature PE", no cyclical section
- [ ] Bank stock: shows "Manual Required" with bank-specific explanation
- [ ] `financial_special_case` stock: shows explanation about normalised earnings needed
- [ ] Cycle position badge color-coded correctly (peak=red, normal=grey)
- [ ] `cyclical_confidence` shown with tooltip
- [ ] Universe Screen: `Regime` column renders regime abbreviation
- [ ] Universe Screen: `valuation_regime` filter works (multi-select, updates stock list)
- [ ] Valuation API returns all 8 new fields; no breaking change to existing fields

## Test Strategy
- Unit tests: `RegimeBadge` renders correct display name for all 9 regimes; conditional rendering
- Unit tests: `CyclePositionBadge` renders correct color for all 5 positions
- Integration test: regime filter in Universe Screen API returns correct subset
- Manual: visual inspection of all 4 test stock profiles listed above
