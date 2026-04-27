# STORY-098 — High Amortisation Earnings Regime

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Add `high_amortisation_earnings` as a new valuation regime that routes mature profitable companies with heavy acquired-intangible D&A (pharma, large-cap acquirers) to `forward_ev_ebitda` instead of `forward_pe`.

**Motivation:** GAAP P/E for companies like ABBV, JNJ, PFE is materially distorted by non-cash amortisation of acquired intangibles. These companies route to `mature_pe` today, getting a `forward_pe` primary metric — the same metric whose distortion was the original motivation for adding `forwardEvEbitda` in STORY-097. STORY-097 added the data and display; this story wires it into metric selection.

**Trigger condition:** `ebitdaNtm / ebitNtm >= 1.30` — implies D&A is at least 30% of EBIT, a reliable signal of heavy acquired-intangible amortisation. Calibrated against live FMP data (2026-04-28):

| Stock | Ratio | Triggers? |
|-------|-------|-----------|
| ABBV  | 1.76x | ✓ Yes |
| PFE   | 1.38x | ✓ Yes |
| JNJ   | 1.35x | ✓ Yes |
| MRK   | 1.19x | ✗ No  |
| AZN   | 1.17x | ✗ No  |
| MSFT  | 1.19x | ✗ No  |

## Story
As a user viewing a pharma or large-cap acquirer stock,
I want the valuation engine to use forward EV/EBITDA as the primary metric automatically,
so that I see a multiple that is not distorted by non-cash amortisation charges.

## Outcome
- Regime selector emits `high_amortisation_earnings` when D&A burden >= 30%
- Metric selector returns `forward_ev_ebitda` for this regime (1:1 lookup)
- Threshold seed contains base family for `high_amortisation_earnings`
- ValuationTab displays the new regime label correctly
- All unit tests pass; no regression in existing 1811-test suite

---

## Scope In

### TASK-098-001: Domain types — add regime and metric values

In `src/domain/valuation/types.ts`:
- Add `'high_amortisation_earnings'` to `ValuationRegime` union
- Add `'forward_ev_ebitda'` to `PrimaryMetric` union
- Add `ebitdaNtm` and `ebitNtm` fields to `RegimeSelectorInput`

### TASK-098-002: Regime selector — implement Step 4.5

In `src/domain/valuation/regime-selector.ts`, insert new step after Step 4:

```typescript
// Step 4.5 — High amortisation earnings
if (
  input.ebitdaNtm != null &&
  input.ebitNtm != null &&
  input.ebitNtm > 0 &&
  input.ebitdaNtm / input.ebitNtm >= 1.30 &&
  netIncomePositive &&
  fcfPositive
) {
  return 'high_amortisation_earnings';
}
```

### TASK-098-003: Metric selector — add regime → metric mapping

In `src/domain/valuation/metric-selector.ts` (or wherever the 1:1 regime→metric lookup lives), add:

```typescript
case 'high_amortisation_earnings':
  return { primaryMetric: 'forward_ev_ebitda', metricReason: 'high_amortisation_regime' };
```

Also update `metricLabels` in `ValuationTab.tsx`:
```typescript
forward_ev_ebitda: 'Fwd EV/EBITDA',
```

### TASK-098-004: Current multiple computor — handle `forward_ev_ebitda`

In `src/domain/valuation/compute-valuation.ts` (or equivalent), add case for `forward_ev_ebitda`:
- Current multiple = stock.forwardEvEbitda (the value computed and stored by STORY-097)
- Basis label: `"EV / NTM EBITDA (FMP ebitdaAvg)"`
- Null guard: if `forwardEvEbitda` is null → `currentMultiple = null`

The `ValuationInput` type must also include `forwardEvEbitda: number | null` (read from DB).

### TASK-098-005: Threshold seed — add `high_amortisation_earnings` row

In `prisma/seed.ts`:
```typescript
{ regime: 'high_amortisation_earnings', metric: 'forward_ev_ebitda',
  max: 16.0, comfortable: 13.0, veryGood: 10.0, steal: 8.0 },
```

**Threshold rationale (calibrated against live pharma EV/EBITDA, 2026-04-28):**
- Steal ≤ 8x: historically cheap for any profitable pharma franchise
- Very Good 8–10x: fair value for quality pharma
- Comfortable 10–13x: premium territory
- Max 13–16x: stretched; defensible only for highest-quality large-cap pharma
- Above Max > 16x: overvalued on any reasonable pharma EBITDA basis

Quality downgrade step config (same as `cyclical_earnings` — similar risk profile):
EQ A→B: 2.0, EQ B→C: 2.0, BS A→B: 1.0, BS B→C: 1.5

### TASK-098-006: Valuation pipeline — pass ebitdaNtm/ebitNtm to regime selector

In `src/modules/valuation/valuation-persistence.service.ts` (or the compute entry point):
- Add `ebitdaNtm` and `ebitNtm` to the DB select query for the stock
- Pass both fields into `RegimeSelectorInput`

### TASK-098-007: Unit tests

Test file: `tests/unit/domain/valuation/story-098-high-amortisation-regime.test.ts`

**BDD Scenario 1 — ABBV-style (ratio 1.76x): routes to `high_amortisation_earnings`**
```
Given: ebitdaNtm = 23B, ebitNtm = 13B (ratio = 1.77x), net_income_positive, fcf_positive
Then: regime = 'high_amortisation_earnings'
And: primaryMetric = 'forward_ev_ebitda'
```

**BDD Scenario 2 — JNJ-style (ratio 1.35x): routes to `high_amortisation_earnings`**
```
Given: ebitdaNtm = 33.5B, ebitNtm = 24.8B (ratio = 1.35x), net_income_positive, fcf_positive
Then: regime = 'high_amortisation_earnings'
```

**BDD Scenario 3 — MRK-style (ratio 1.19x): routes to `mature_pe` (below threshold)**
```
Given: ebitdaNtm = 28.7B, ebitNtm = 24.2B (ratio = 1.19x), net_income_positive, fcf_positive
Then: regime = 'mature_pe'
And: primaryMetric = 'forward_pe'
```

**BDD Scenario 4 — ebitdaNtm null: falls through to `mature_pe`**
```
Given: ebitdaNtm = null, net_income_positive, fcf_positive
Then: regime = 'mature_pe' (Step 4.5 skipped)
```

**BDD Scenario 5 — growth path takes precedence (Step 2 fires before Step 4.5)**
```
Given: ebitdaNtm/ebitNtm = 1.76x, BUT revenue_growth_fwd = 0.25, op_margin = 0.30, fcf_conversion = 0.70
Then: regime = 'profitable_growth_pe' (Step 2 fires — growth path wins)
```

**BDD Scenario 6 — regime label renders correctly in ValuationTab**
```
Given: regime = 'high_amortisation_earnings'
Then: RegimeBadge displays the correct label (no crash, no undefined)
```

---

## Scope Out
- Trailing EV/EBITDA (separate story; requires TTM D&A from income statement)
- Dynamic threshold calibration (thresholds above are provisional; calibration-basket validation deferred)
- Universe screen column for `high_amortisation_earnings` regime (display-only for now)

---

## Acceptance Criteria

- [ ] `high_amortisation_earnings` regime fires for ABBV, JNJ, PFE (ebitda/ebit ≥ 1.30)
- [ ] `mature_pe` still fires for MRK, AZN, MSFT, WMT (ratio below 1.30 or ebitdaNtm null)
- [ ] `forward_ev_ebitda` is selected as primary metric for `high_amortisation_earnings`
- [ ] Threshold seed row present; valuation zone computed correctly
- [ ] Growth path (Steps 2–4) takes precedence over Step 4.5 when growth qualifies
- [ ] Data null guard: ebitdaNtm=null → regime falls through to mature_pe, no error
- [ ] All 6 BDD unit tests pass
- [ ] No regression in existing 1811 unit tests

---

## Dependencies
- STORY-097 ✅ (`ebitdaNtm` and `forwardEvEbitda` fields in DB and sync pipeline)
- ADR-017 amendment (2026-04-28) ✅
- RFC-003 amendment (2026-04-28) ✅
- PRD amendment (2026-04-28) ✅

## Status
`ready`
