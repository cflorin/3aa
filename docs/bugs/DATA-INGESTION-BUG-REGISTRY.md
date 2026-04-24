# Data Ingestion Bug Registry

**Scope:** EPIC-003 / EPIC-003.1 — forward estimates sync, metric computation, data quality  
**Format mirrors:** `CLASSIFICATION-ENGINE-BUG-REGISTRY.md`

---

## Severity Definitions

| Level | Meaning |
|-------|---------|
| CRITICAL | Produces wrong data for all stocks; pipeline output is entirely unreliable |
| HIGH | Produces wrong metric for a systematic class of stocks (e.g. all Non-GAAP reporters) |
| MEDIUM | Wrong in edge cases; does not affect the majority of stocks |
| LOW | Cosmetic or rounding issue; does not affect classification or display materially |

---

## Summary

| Bug ID | Severity | Component | Short description | Status |
|--------|----------|-----------|-------------------|--------|
| BUG-DI-001 | HIGH | Forward estimates sync — `eps_growth_fwd` | Non-GAAP NTM EPS compared against GAAP TTM without applying `gaapAdjustmentFactor` → inflates growth for all Non-GAAP reporters | **FIXED 2026-04-24** |

---

## BUG-DI-001 — GAAP/Non-GAAP mismatch inflates `eps_growth_fwd` for Non-GAAP reporters ✅ FIXED

**Fixed:** 2026-04-24

**Severity:** HIGH  
**Component:** `src/modules/data-ingestion/jobs/forward-estimates-sync.service.ts` — `epsGrowthFwdComputed`  
**Story reference:** STORY-028 (Forward Estimates Enrichment), STORY-031 (GAAP/Non-GAAP Reconciliation Factor)  
**Stocks affected:** All stocks where analyst consensus (FMP `epsAvg`) is Non-GAAP and GAAP/Non-GAAP gap is material (ADBE confirmed; likely MSFT, UBER, others)

### Observed output (ADBE, 2026-04-24)

| Field | Value |
|-------|-------|
| `epsTtm` (GAAP, from income statement) | $17.18 |
| `nonGaapEpsFy` (FMP analyst consensus, most recent FY) | $20.82 |
| `gaapAdjustmentFactor` (= GAAP / NonGAAP) | 0.8251 |
| `epsNtm` (FMP analyst NTM consensus, Non-GAAP) | $23.53 |
| `epsGrowthFwd` stored (wrong — apples vs oranges) | **36.98%** |
| `epsGrowthFwd` corrected (after adjustment) | **~13%** |

### Root cause

In `forward-estimates-sync.service.ts`, `epsGrowthFwdComputed` was computed **before** `gaapAdjustmentFactor` and without applying it:

```typescript
// BUG: epsNtm is Non-GAAP; epsTtmNum is GAAP — comparing directly overstates growth
const epsGrowthFwdComputed = epsNtm != null && epsTtmNum != null && Math.abs(epsTtmNum) > 0.001
  ? ((epsNtm - epsTtmNum) / Math.abs(epsTtmNum)) * 100
  : null;
```

`epsNtm` comes from FMP `epsAvg` which is the Non-GAAP analyst consensus.  
`epsTtmNum` comes from FMP `epsDiluted` (income statement), which is GAAP.  
For companies like ADBE where Non-GAAP EPS is ~20% above GAAP, this inflates the growth figure by that same ~20% spread.

STORY-031 built `gaapAdjustmentFactor = epsTtm / nonGaapEpsMostRecentFy` precisely to bridge this gap, but it was never applied to `epsGrowthFwdComputed`.

### Fix

1. Move `gaapAdjustmentFactor` computation before `epsGrowthFwdComputed`.
2. Apply the factor **only when < 1.0** (downward normalization only). Factor > 1.0 indicates
   either a period mismatch (e.g. Tiingo CY epsTtm vs FMP FY estimates) or a one-time GAAP gain —
   in both cases inflating forward estimates is wrong.

```typescript
// Only apply when factor < 1.0 (Non-GAAP > GAAP — the normal case).
// Factor > 1.0: GAAP > NonGAAP consensus, likely period mismatch (Tiingo CY vs FMP FY) — skip.
const effectiveFactor = gaapAdjustmentFactor !== null && gaapAdjustmentFactor < 1.0
  ? gaapAdjustmentFactor : null;
const epsNtmGaapEquiv = epsNtm !== null && effectiveFactor !== null
  ? epsNtm * effectiveFactor : epsNtm;
```

### Evidence post-fix

ADBE re-synced 2026-04-24: `epsGrowthFwd` = **13.0%** (factor 0.825 applied — Non-GAAP premium normalized)  
MSFT re-synced 2026-04-24: `epsGrowthFwd` = **18.2%** (factor 1.196 > 1.0 — capped, no upward inflation)

### Residual limitation

`epsTtm` for non-December FY companies (MSFT: June 30) may come from Tiingo CY data while
`nonGaapEpsFy` comes from FMP FY estimates — misaligned windows. A proper date-matching guard
(V1 simplification: skipped) would fix this definitively by ensuring both values reference the
same fiscal period.
