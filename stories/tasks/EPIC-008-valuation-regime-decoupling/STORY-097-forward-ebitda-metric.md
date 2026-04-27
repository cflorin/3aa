# STORY-097 — Forward EV/EBITDA Metric

## Epic
EPIC-008 — Valuation Regime Decoupling

## Purpose
Add forward EV/EBITDA as a valuation metric for stocks where GAAP EPS is materially distorted by non-cash charges — primarily large acquired-intangible amortisation (pharma, large-cap acquirers) and depreciation-heavy businesses. EV/EBITDA neutralises these non-cash distortions and is the industry-standard forward metric for these sectors.

**Motivation (AZN example):** AZN forward P/E = 12.92x is technically correct under GAAP but misleading because the GAAP adjustment factor (1.43) reflects a one-time FY2025 milestone payment that will not recur. The non-GAAP forward P/E of 18.45x (market standard) is computed as price / epsNtm without adjustment. Forward EV/EBITDA sidesteps both issues by working at the enterprise level with earnings before non-cash charges.

## Story
As a user viewing a stock with heavy amortisation,
I want to see forward EV/EBITDA alongside P/E and EV/EBIT,
so that I can assess valuation without non-cash distortions inflating the denominator.

## Outcome
- `forwardEvEbitda` computed and stored for all stocks where `ebitNtm` and `depreciationNtm` are both available
- Displayed on the Stock Detail valuation tab
- Used by the regime-driven threshold assigner when `regime = bank_pe` or `depreciationWeight = high` (future: EPIC-009 metric selection)

---

## Scope In

### TASK-097-001: FMP adapter — fetch `depreciationNtm`

FMP `/analyst-estimates` returns `depreciationAvg` per period (annual). Add to `fetchForwardEstimates()`:

```typescript
const depreciationNtm = ntmEntry.depreciationAvg != null
  ? Number(ntmEntry.depreciationAvg)
  : null;
```

Return `depreciationNtm` from the adapter alongside `ebitNtm`.

**Provenance key:** `depreciation_ntm` · provider: `fmp` · period_end: ntmEntry.date

**Fallback:** If `depreciationAvg` is null/absent for a stock (FMP does not always provide it for non-US issuers), `depreciationNtm = null` and `forwardEvEbitda = null` — no error.

### TASK-097-002: Schema — add `depreciation_ntm` and `forward_ev_ebitda` columns

Migration: `20260428000001_add_forward_ebitda`

```sql
ALTER TABLE "stocks"
  ADD COLUMN "depreciation_ntm"    DECIMAL(20,2),
  ADD COLUMN "forward_ev_ebitda"   DECIMAL(8,4);
```

Prisma schema: add `depreciationNtm Decimal?` and `forwardEvEbitda Decimal?` to the `Stock` model.

### TASK-097-003: Forward-estimates sync — compute and persist `forwardEvEbitda`

In `forward-estimates-sync.service.ts`, after `ebitNtm` is available:

```typescript
const depreciationNtm = estimatesResult.value?.depreciationNtm ?? null;

const ebitdaNtm =
  ebitNtm !== null && depreciationNtm !== null
    ? ebitNtm + depreciationNtm
    : null;

const forwardEvEbitda =
  ev != null && ebitdaNtm != null && ebitdaNtm > 0
    ? ev / ebitdaNtm
    : null;
```

Persist to DB:
```typescript
if (depreciationNtm !== null) {
  updateData.depreciationNtm = depreciationNtm;
  provenanceUpdates['depreciation_ntm'] = { provider: 'fmp', synced_at: now, period_end: ntmEntry.date, fallback_used: false };
}
if (forwardEvEbitda !== null) {
  updateData.forwardEvEbitda = forwardEvEbitda;
  provenanceUpdates['forward_ev_ebitda'] = { provider: 'computed', synced_at: now, fallback_used: false };
}
```

### TASK-097-004: Stock Detail — display `forwardEvEbitda` on valuation tab

Add EV/EBITDA row to the valuation metrics section in `ValuationTab.tsx`, between EV/EBIT and EV/Sales:

```
Forward EV/EBITDA   12.5x    (shown when non-null; greyed out when null)
```

Label: "Fwd EV/EBITDA". Show `—` when null (FMP did not provide D&A estimate).

### TASK-097-005: Unit tests

**BDD Scenario 1 — D&A available:**
```
Given: ev = $2,940B, ebitNtm = $28B, depreciationNtm = $5B
Then: ebitdaNtm = $33B
And: forwardEvEbitda = 2940 / 33 = 89.1x
```

**BDD Scenario 2 — D&A unavailable (FMP returns null):**
```
Given: depreciationNtm = null
Then: forwardEvEbitda = null (no error, field absent from update payload)
```

**BDD Scenario 3 — ebitda ≤ 0 (negative EBITDA):**
```
Given: ebitNtm = -1B, depreciationNtm = 0.5B → ebitdaNtm = -0.5B
Then: forwardEvEbitda = null (not computed when denominator ≤ 0)
```

Test file: `tests/unit/data-ingestion/story-097-forward-ebitda.test.ts`

---

## Scope Out
- Trailing EV/EBITDA (separate story if needed; requires TTM D&A from income statement)
- Using EV/EBITDA in threshold selection / regime logic — **implemented in STORY-098** (not deferred to EPIC-009)
- Displaying EV/EBITDA on the universe screen table (defer unless user requests)

---

## Acceptance Criteria

- [ ] `depreciationNtm` populated for stocks where FMP provides it (expected: US large-caps; may be sparse for ADRs)
- [ ] `forwardEvEbitda = ev / (ebitNtm + depreciationNtm)` computed correctly when both inputs non-null
- [ ] `forwardEvEbitda = null` when either input is null or when ebitda ≤ 0
- [ ] AZN: `forwardEvEbitda` displays on valuation tab (if FMP provides AZN depreciation estimates)
- [ ] All unit tests pass; no regression in existing forward-estimates tests
- [ ] Provenance recorded for both new fields

---

## Dependencies
- STORY-094 ✅ (forward-estimates-sync pipeline)
- FMP `/analyst-estimates` `depreciationAvg` field availability (to be validated during TASK-097-001)

## Status
`ready`
