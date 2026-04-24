# UI Bug Registry — v1 (2026-04-24)

**Source:** Visual inspection against spec (`docs/ui/project/3aa/`) using screenshot `docs/bugs/uiv1/list - no style.png` and code review of all `src/components/` files.  
**Spec authority:** `docs/ui/project/3aa/app.jsx` (theme tokens), `components.jsx` (shared components), `screen-universe.jsx`, `screen-stock-detail.jsx`, `screen-other.jsx`.  
**Fix story:** STORY-054 — UI Theme Compliance  

---

## Severity Definitions

| Level | Meaning |
|-------|---------|
| CRITICAL | Core user experience broken; screen unrecognisable vs. spec |
| HIGH | Significant visual deviation; wrong colours, layout, or component type |
| MEDIUM | Incorrect detail; right component, wrong styling |
| LOW | Minor cosmetic gap |

---

## Bug List

### BUG-001 — Dark terminal theme entirely absent
**Severity:** CRITICAL  
**Screens affected:** All  
**Expected:** All screens use the dark terminal colour palette defined in `app.jsx`:
- `bg: "#0b0d11"` (page background)
- `headerBg / sidebarBg: "#0e1016"`
- `text: "#d4d8e0"`, `textMuted: "#8b92a5"`, `textDim: "#4a5068"`
- `border: "#1e2230"`, `borderFaint: "#181c27"`
- `accent: "#2dd4bf"` (cyan/teal primary)

**Actual:** All screens render with white/near-white backgrounds (`#fff`, `#f9fafb`) and near-black text (`#111827`). The colour scheme is the opposite of the spec.  
**Root cause:** No theme token file; all components hardcode light-mode colours.  
**Fix:** Create `src/lib/theme.ts` with theme constants; propagate to all components.

---

### BUG-002 — Sidebar navigation missing
**Severity:** CRITICAL  
**Screens affected:** All authenticated screens  
**Expected:** Fixed left sidebar (width 200px) containing:
- Logo block (24×24 accent square + "3AA" text)
- Nav links: Universe, Alerts, Settings (with active state indicator)
- User section at bottom (avatar + email)
- Sidebar background `#0e1016`, right border `#1e2230`

**Actual:** No sidebar exists. Content fills full viewport width.  
**Root cause:** No `src/app/(authenticated)/layout.tsx` file.  
**Fix:** Create authenticated layout with `Sidebar` component.

---

### BUG-003 — DM Sans and DM Mono fonts not loaded
**Severity:** HIGH  
**Screens affected:** All  
**Expected:** 
- Body font: `'DM Sans', sans-serif`
- Monospace font (codes, tickers, numbers): `'DM Mono', monospace`

**Actual:** Body font is `system-ui, sans-serif`; monospace is the browser default.  
**Root cause:** Fonts never declared in root layout or global CSS.  
**Fix:** Load via `next/font/google` in `src/app/layout.tsx`; apply as CSS variables.

---

### BUG-004 — Universe page outer layout wrong
**Severity:** HIGH  
**Screens affected:** Universe  
**Expected:** Full-height flex column (`flex: 1, overflow: hidden`). Filter bar at top, scrollable table in middle, pagination pinned at bottom.  
**Actual:** `<main>` with `padding: 1.5rem` and `<h1>Universe</h1>` as a separate heading above the filter bar.  
**Fix:** Remove `<main>` wrapper + `<h1>`; restructure as flex column with filter bar integrated into header row.

---

### BUG-005 — FilterBar colour scheme wrong (light → dark)
**Severity:** HIGH  
**Screens affected:** Universe  
**Expected:**
- Container: `background: #0e1016`, `border-bottom: 1px solid #1e2230`, `padding: 8px 14px`
- "Universe" title inside bar (13px, fontWeight 600, `#d4d8e0`)
- Stock count beside title (11px, `#4a5068`)
- Inputs: `background: #0b0d11`, `border: 1px solid #1e2230`, `color: #d4d8e0`, `fontSize: 12`, `borderRadius: 4`

**Actual:** White/light container, uppercase bold labels above each control, light gray borders, white inputs.  
**Fix:** Rewrite FilterBar with dark theme constants.

---

### BUG-006 — Confidence filter uses checkboxes instead of select dropdown
**Severity:** HIGH  
**Screens affected:** Universe  
**Expected:** Single `<select>` dropdown with options: All / High / Medium / Low / No classification  
**Actual:** Four HTML checkboxes rendered as a vertical column (multi-select)  
**Note:** The spec (`screen-universe.jsx`) uses a single-value confidence select, not multi-select checkboxes.  
**Fix:** Replace checkbox group with a `<select>` element matching spec options and styling.

---

### BUG-007 — Sector filter uses multi-select list box
**Severity:** MEDIUM  
**Screens affected:** Universe  
**Expected:** Single `<select>` dropdown (matching other filter controls)  
**Actual:** `<select multiple>` rendered as a visible listbox (height 80px), only shown when sectors exist  
**Fix:** Replace with single-select dropdown; first option = "All sectors".

---

### BUG-008 — Universe page "Universe" title is an `<h1>` outside filter bar
**Severity:** MEDIUM  
**Screens affected:** Universe  
**Expected:** "Universe" text is a `fontSize: 13, fontWeight: 600` span inside the filter bar row  
**Actual:** `<h1 style="fontSize: 1.5rem; fontWeight: 700">Universe</h1>` renders above the filter bar  
**Fix:** Remove `<h1>`; embed title text in FilterBar or UniversePageClient header row.

---

### BUG-009 — Table header styling wrong
**Severity:** HIGH  
**Screens affected:** Universe  
**Expected:**
- `padding: 6px 10px`, `fontSize: 10px`, `fontWeight: 600`
- `letterSpacing: 0.07em`, `textTransform: uppercase`
- `color: #4a5068` (inactive) / `#2dd4bf` (active sort)
- `background: #0e1016`, `border-bottom: 1px solid #1e2230`
- `position: sticky`, `top: 0`, `zIndex: 1`

**Actual:** `padding: 8px 12px`, `fontSize: 0.75rem`, `color: #6b7280`, `background: #f9fafb`, `border-bottom: 2px solid #e5e7eb`. No sticky positioning.  
**Fix:** Apply dark theme `TH` constants.

---

### BUG-010 — Table row/cell styling wrong
**Severity:** HIGH  
**Screens affected:** Universe  
**Expected:**
- Row hover: `background: #161a25`
- Row separator: `border-bottom: 1px solid #181c27`
- Cell padding: `5px 10px`, `fontSize: 12px`
- Ticker cell: `fontFamily: 'DM Mono'`, `color: #d4d8e0`, `fontWeight: 700`
- Inactive rows: `opacity: 0.5` (muted, not 0.6)

**Actual:** Row hover `#f0fdf4` (light green), separator `#f3f4f6`, cell padding `10px 12px`, `fontSize: 0.875rem`, background white.  
**Fix:** Apply dark theme `TD`/`TR` constants.

---

### BUG-011 — Metric colour thresholds use wrong denominator
**Severity:** MEDIUM  
**Screens affected:** Universe  
**Expected:** Growth metrics stored as decimals in API (`0.072 = 7.2%`); threshold `>= 0.08` for green, `>= 0.03` for orange  
**Actual:** Same thresholds applied — but spec shows growth fields as percentages in the display layer (DB stores as pct `7.2`, API returns `7.2`, `fmtPct` multiplies by 100). Need to verify formatting matches spec column display.  
**Note:** Formatting functions look correct (`fmtPct` multiplies by 100); colour thresholds need verification against spec.  
**Status:** Needs runtime verification (no data in prod yet).

---

### BUG-012 — Pagination controls styling wrong
**Severity:** MEDIUM  
**Screens affected:** Universe  
**Expected:**
- Container: `padding: 6px 14px`, `background: #0e1016`, `border-top: 1px solid #1e2230`
- Buttons: `padding: 3px 10px`, `fontSize: 11px`, `borderRadius: 3`, `border: 1px solid #1e2230`, `color: #8b92a5`
- Current page: `border: #2dd4bf`, `background: #2dd4bf + "20"`, `color: #2dd4bf`, `fontWeight: 600`

**Actual:** Light background, default browser button styling, no accent colour for current page.  
**Fix:** Rewrite PaginationControls with dark theme.

---

### BUG-013 — Sign-in page wrong styling
**Severity:** HIGH  
**Screens affected:** Sign-in  
**Expected (from `screen-other.jsx` SignInScreen):**
- Full-height centered layout, `background: #0b0d11`
- Logo: 36×36 accent square with "3A" monospace text in white
- Form card: `background: #131620`, `border: 1px solid #1e2230`, `borderRadius: 8`, `padding: 24px`
- Inputs: `background: #0b0d11`, `border: 1px solid #1e2230`, `color: #d4d8e0`, `fontSize: 13`, `padding: 8px 10px`
- Submit button: `background: #2dd4bf`, `color: #fff`, `width: 100%`, `padding: 9px`

**Actual:** Need to check current sign-in page against this (not shown in screenshot but currently deployed).  
**Fix:** Rewrite sign-in form and page with dark theme.

---

### BUG-014 — Stock detail page missing dark theme and correct layout
**Severity:** HIGH  
**Screens affected:** Stock Detail  
**Expected (from `screen-stock-detail.jsx`):**
- Header bar: `padding: 10px 16px`, `background: #0e1016`, `border-bottom: 1px solid #1e2230`
- Back button: `color: #2dd4bf`, `fontSize: 12`
- Ticker: `fontFamily: 'DM Mono'`, `fontSize: 18`, `fontWeight: 700`, `color: #d4d8e0`
- Tab bar: `background: #0e1016`, bottom border, active tab `color: #2dd4bf`, underline
- Tab content panels: dark backgrounds, DM Mono for codes/numbers

**Actual:** Light background throughout; implementation uses `StockDetailClient.tsx` with inline light styles.  
**Fix:** Apply dark theme throughout StockDetailClient and all sub-components.

---

### BUG-015 — Score bars, confidence steps, tie-break list missing dark theme
**Severity:** HIGH  
**Screens affected:** Stock Detail — Classification tab  
**Expected:** All sub-components (`ScoreBar`, `ConfidenceSteps`, `TieBreakList`, `FlagPill`, `StarRating`) use dark theme colours  
**Actual:** Components use light/white backgrounds and default colours  
**Fix:** Apply T constants to all stock detail sub-components.

---

### BUG-016 — ClassificationBadge and ConfidenceBadge missing dark theme
**Severity:** MEDIUM  
**Screens affected:** Universe, Stock Detail  
**Expected:** Badges use themed colours (dark background, accent/status colours as per spec)  
**Actual:** Unknown — need to inspect current badge components  
**Fix:** Inspect and apply dark theme.

---

### BUG-017 — MonitoringToggle missing dark theme
**Severity:** MEDIUM  
**Screens affected:** Universe  
**Expected:** Toggle buttons styled to match dark theme (border `#1e2230`, text `#8b92a5`, active accent `#2dd4bf`)  
**Actual:** Uses light-coloured toggle buttons  
**Fix:** Apply dark theme.

---

## Summary

| # | Bug | Severity | Screen |
|---|-----|----------|--------|
| BUG-001 | Dark terminal theme absent | CRITICAL | All |
| BUG-002 | Sidebar navigation missing | CRITICAL | All auth |
| BUG-003 | DM Sans + DM Mono fonts not loaded | HIGH | All |
| BUG-004 | Universe page outer layout wrong | HIGH | Universe |
| BUG-005 | FilterBar colour scheme wrong | HIGH | Universe |
| BUG-006 | Confidence filter: checkboxes → select | HIGH | Universe |
| BUG-007 | Sector filter: multi-select → select | MEDIUM | Universe |
| BUG-008 | Universe h1 outside filter bar | MEDIUM | Universe |
| BUG-009 | Table header styling wrong | HIGH | Universe |
| BUG-010 | Table row/cell styling wrong | HIGH | Universe |
| BUG-011 | Metric colour thresholds (verify) | MEDIUM | Universe |
| BUG-012 | Pagination styling wrong | MEDIUM | Universe |
| BUG-013 | Sign-in page wrong styling | HIGH | Sign-in |
| BUG-014 | Stock detail missing dark theme | HIGH | Stock Detail |
| BUG-015 | Score/step/flag sub-components | HIGH | Stock Detail |
| BUG-016 | Classification/Confidence badges | MEDIUM | Universe + Detail |
| BUG-017 | MonitoringToggle wrong styling | MEDIUM | Universe |

**Total:** 17 bugs — 2 CRITICAL, 8 HIGH, 6 MEDIUM, 1 LOW  
**Fix story:** STORY-054  
**Registered:** 2026-04-24
