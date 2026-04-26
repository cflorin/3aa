# BUG-001 — Quarterly Tab Renders Blank

**Severity:** HIGH  
**Found:** 2026-04-25  
**Story:** STORY-073 (Quarterly tab implementation)  
**Status:** In fix

---

## Symptom

Navigating to a stock detail page and clicking the **Quarterly** tab shows a completely blank panel. No data, no loading indicator, no empty-state message is visible to the user.

## Root Causes (two independent issues)

### RC-1 — No quarterly data in the local database

The API `GET /api/stocks/MSFT/quarterly-history` returns `{"quarters":[],"derived":null}` because the quarterly sync cron job (`/api/cron/quarterly-history`) has never been run against the local test DB. This is an operational gap, not a code bug, but the UI must communicate it clearly.

### RC-2 — Silent failure rendering in the component

The component has three states but only two are handled visibly:

| State | `qhLoading` | `qhData` | What renders |
|-------|------------|---------|-------------|
| Initial (before effect fires) | `false` | `null` | **Nothing — blank panel** |
| Loading | `true` | `null` | "Loading quarterly data…" (correct) |
| Empty DB response | `false` | `{quarters:[],derived:null}` | "No quarterly history available yet." — but 12px dim text, effectively invisible |
| Has data | `false` | `{quarters:[...]}` | Table (correct) |

The initial blank state (before the useEffect fires) is a React lifecycle gap: the effect fires after the first render, so there is a frame where `qhLoading=false, qhData=null` and nothing renders. With fast networks this is a single frame, but it is still a missing case.

More importantly, the empty-state message ("No quarterly history available yet.") uses `color: T.textDim, fontSize: 12` — near-invisible on a dark background. A user staring at the panel sees nothing actionable.

### RC-3 — No unit tests for Quarterly tab rendering

The Quarterly tab was added in STORY-073 but no unit tests were written for any of its rendering states (loading, empty, with data, error). This means the above bugs cannot be caught automatically.

---

## Required Fix

### Component (`StockDetailClient.tsx`)

The Quarterly tab must handle **all four states** explicitly with prominent, user-readable messages:

1. **Initial / null** (`!qhLoading && !qhData`): show the same loading indicator as the loading state — the distinction is invisible to the user and the effect fires immediately anyway.
2. **Loading** (`qhLoading`): "Loading quarterly data…" spinner or text.
3. **Empty** (`qhData.quarters.length === 0`): prominent message explaining that no data exists in the database and that the quarterly sync job must be run. Show a hint to the admin.
4. **Has data**: render the 8-quarter table and derived metrics panel.

### Unit tests (`tests/unit/components/StockDetail.test.tsx`)

The following scenarios must be covered with mocked fetch responses:

- Loading state is shown while the fetch is in-flight
- Empty state is shown (prominently, text accessible) when API returns `{quarters:[], derived:null}`
- Quarter table rows render correctly for a 2-quarter fixture (Q1 and Q2)
- Monetary values are formatted in $M
- Margin percentages are formatted with one decimal place
- Derived metrics panel renders key fields when `derived` is present
- Null derived fields render as `—`
- Error state (fetch throws) shows the empty state, not a crash
- Data is **not** fetched until the Quarterly tab is first visited (lazy load)
- Data is fetched exactly once even if the user switches away and back to the Quarterly tab

---

## Spec: What the Quarterly Tab Must Display

### Section 1 — 8-Quarter Raw Financials Table

Source: `GET /api/stocks/[ticker]/quarterly-history` → `quarters[]`

| Column | Field | Format |
|--------|-------|--------|
| Quarter | `Q{fiscal_quarter} {fiscal_year}` | e.g. Q1 2024 |
| Revenue | `revenue` | `$XM` (null → `—`) |
| Gross Profit | `gross_profit` | `$XM` |
| Op. Income | `operating_income` | `$XM`, red if negative |
| Net Income | `net_income` | `$XM`, red if negative |
| FCF | `free_cash_flow` | `$XM`, red if negative |
| CFO | `cash_from_operations` | `$XM` |
| Gross Mgn | `gross_margin` | `XX.X%` (color: ≥60% green, ≥40% amber, else red) |
| Op. Mgn | `operating_margin` | `XX.X%` (color: ≥20% green, ≥0% amber, else red) |
| Net Mgn | `net_margin` | `XX.X%` (color: same as Op. Mgn) |

### Section 2 — Derived Trend Metrics Panel

Source: `derived` object from same endpoint.

**TTM Rollups**
- Revenue TTM (`revenue_ttm`): `$X.XXB`
- Op. Income TTM (`operating_income_ttm`): `$X.XXB`, red if negative
- Net Income TTM (`net_income_ttm`): `$X.XXB`, red if negative
- FCF TTM (`free_cash_flow_ttm`): `$X.XXB`, red if negative
- Op. Margin TTM (`operating_margin_ttm`): `XX.X%`
- FCF Margin TTM (`fcf_margin_ttm`): `XX.X%`

**Margin Slopes (4 quarters, pp/quarter)**
- Gross Margin Slope, Op. Margin Slope, Net Margin Slope
- Format: `+0.23pp ▲` (green) / `-0.18pp ▼` (red) / `0.00pp —` (muted)
- Threshold: `|slope| > 0.001` to show ▲/▼

**Stability Scores (0.0–1.0)**
- Op. Margin Stability, Gross Margin Stability
- Color: ≥0.70 green, ≥0.40 amber, <0.40 red

**Earnings Quality**
- EQ Trend Score: `+0.45` colored badge (≥0.30 green, ≤-0.30 red, else amber)
- Deteriorating Cash Conversion: Yes (red) / No / `—`
- Op. Leverage Emerging: Yes (green) / No / `—`

**Dilution & SBC**
- Material Dilution Flag: Yes (red) / No / `—`
- Shares Change 4Q / 8Q: `XX.X%` (red if >2% / >4%)
- SBC Burden Score: `0.XX` (red if >0.50)
- SBC as % Revenue TTM: `XX.X%` (red if >10%)

**Data Coverage**
- Quarters Available: integer
- Derived As Of: `MM/DD/YYYY`

### Empty State

When `quarters.length === 0`:

> **No quarterly history data**  
> The quarterly sync job has not yet been run for this stock. An admin can trigger it at `/api/cron/quarterly-history`.

This must be rendered in normal body text size (≥13px), not dim/small.
