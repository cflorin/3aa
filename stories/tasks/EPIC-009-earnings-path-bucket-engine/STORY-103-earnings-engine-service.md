# STORY-103 — Earnings Engine Service (Historical + Forward EPS with FY2 Fallback Chain)

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Implement the Earnings Engine as a standalone pure-function service that computes `normalized_eps_hist_growth` (from rolling TTM EPS per-share series) and `normalized_eps_fwd_growth` (from the FY2 fallback chain L1–L4). This is the second major input block to the base formula. The fallback chain logic is critical: it determines `fwd_eps_fallback_level` (1–4) and the associated confidence reductions.

## Story
As the Earnings Path Engine,
I want an Earnings Engine service that computes per-share EPS growth from historical series and the FY2 fallback chain,
so that the bucket formula has a properly weighted forward earnings signal with explicit confidence grading.

## Outcome
`EarningsEngineService.compute(input)` returns `normalized_eps_hist_growth`, `normalized_eps_fwd_growth` (or null at L4), `fwd_eps_fallback_level` (1–4), and associated confidence reductions. All EPS computations use per-share values; the aggregate fallback (operating EPS series) is used when GAAP EPS is not meaningful. The service is pure, fully unit-tested.

## Scope In
- Service: `src/domain/classification/engines/earnings-engine.service.ts`
- Historical EPS series: rolling TTM diluted EPS reconstructed from `StockQuarterlyHistory`:
  ```
  eps_ttm_q = sum(net_income over 4Q ending at q) / avg(diluted_shares_outstanding over same 4Q)
  ```
- Fallback to operating EPS TTM series when GAAP EPS is negative/distorted in ≥ 6 of last 12 quarters
- Historical EPS growth: `0.60 × eps_growth_hist_long + 0.40 × eps_growth_hist_recent`
- Forward EPS — FY2 fallback chain (in order):
  - L1: `((epsAvg_fy2 / epsAvg_fy0)^0.5) − 1` (annualised 2-year CAGR); confidence −0
  - L2: `epsNtm × (1 + revenueGrowthFwd) / epsNtm − 1` as FY2 proxy; confidence −0.10
  - L3: `(epsNtm − epsMostRecentFy) / |epsMostRecentFy|` (1-year fwd only); confidence −0.15
  - L4: no forward EPS; confidence −0.25 (caller re-weights base formula to 0.60rev + 0.40hist)
  - L4 also applies when FY0 EPS is negative or zero (CAGR undefined)
- Negative base rule: when `epsAvg_fy0 < 0`, skip to L4 regardless
- `fwd_eps_fallback_level` output: Int 1–4
- All confidence reductions reported as a list

## Scope Out
- Not responsible for fetching quarterly history (caller passes the series)
- Not responsible for DB writes
- Not responsible for base formula assembly (STORY-108)
- No re-weighting of the base formula for L4 — that is STORY-108's responsibility (this service just returns null for fwd and reports L4)
- Operating EPS fallback series computation: included (but the switch criterion — ≥6 negative EPS quarters — is in this service)

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §8 (Earnings Engine), §8.3 (FY2 fallback chain)
- ADR: ADR-013 V2 base formula (historical EPS weights 0.60/0.40)
- Framework: V2.1 §3.3
- Upstream: STORY-100 (types); STORY-101 (provides `epsFy2Avg` value to pass in)

## Preconditions
- `StockQuarterlyHistory` has net_income and diluted_shares_outstanding per quarter
- `Stock.epsFy2Avg` populated by STORY-101 (or null if unavailable)
- `Stock.epsNtm` and `Stock.gaapEpsCompletedFy` (FY0 base) available on Stock row

## Inputs
```typescript
interface EarningsEngineInput {
  // Quarterly history arrays (ascending chronological)
  netIncomeSeries: (number | null)[];
  dilutedSharesSeries: (number | null)[];
  // Forward estimates
  epsFy2Avg: number | null;      // from STORY-101
  epsNtm: number | null;         // NTM consensus EPS (already on Stock)
  epsMostRecentFy: number | null; // FY0 — most recently completed FY EPS (gaapEpsCompletedFy)
  revenueGrowthFwd: number | null; // used for L2 extrapolation
}
```

## Outputs
```typescript
interface EarningsEngineResult {
  normalizedEpsHistGrowth: number | null;
  normalizedEpsFwdGrowth: number | null;    // null when L4 applied
  fwdEpsFallbackLevel: 1 | 2 | 3 | 4;
  epsHistLong: number | null;
  epsHistRecent: number | null;
  operatingEpsFallbackUsed: boolean;
  confidenceReductions: EarningsConfidenceReduction[];
}
```

## Acceptance Criteria
- [ ] L1 fires when `epsFy2Avg` non-null and `epsMostRecentFy` > 0 → annualised CAGR correct
- [ ] L1 does NOT fire when `epsMostRecentFy` ≤ 0, regardless of `epsFy2Avg` presence
- [ ] L2 fires when FY2 entry exists but `epsFy2Avg` null AND `epsNtm` and `revenueGrowthFwd` non-null
- [ ] L3 fires when only `epsNtm` available (FY2 absent)
- [ ] L4 fires when all forward signals absent OR `epsMostRecentFy` ≤ 0 at L1 check
- [ ] Operating EPS fallback activates when GAAP EPS negative/distorted in ≥ 6 of last 12 quarters
- [ ] `normalizedEpsHistGrowth = 0.60 × long + 0.40 × recent` when both available
- [ ] Historical growth computed from per-share values only (never aggregate net income)
- [ ] All confidence reductions correctly reported
- [ ] Unit test coverage ≥ 80%

## Test Strategy Expectations
- Unit tests (`tests/unit/classification/engines/earnings-engine.service.test.ts`):
  - L1 path: FY2 available, FY0 positive → correct CAGR
  - L1 skip: FY0 negative → falls to L2/L3/L4
  - L2 path: FY2 entry absent, NTM available, fwd available → proxy computation correct
  - L3 path: only NTM available → 1-year fwd growth
  - L4 path: no forward signals → returns null fwd, reports L4 and −0.25
  - Operating fallback: 7 negative EPS quarters → fallback activates, −0.10 confidence
  - Per-share invariant: dilution halves shares → EPS growth different from aggregate growth
  - Historical weight: 20-quarter series gives different result from 4-quarter series
- Integration tests: N/A (pure function)
- Contract tests: output interface shape correct
- BDD:
  - `Given` stock with FY0 EPS = $5.00, FY2 EPS = $6.05; `When` earnings engine runs; `Then` normalizedEpsFwdGrowth ≈ sqrt(6.05/5.00) − 1 ≈ 0.10 and fallbackLevel = 1
- E2E: N/A

## Regression / Invariant Risks
- Per-share invariant is non-negotiable: service must compute per-share EPS, not aggregate EPS
- L1/L2/L3/L4 are mutually exclusive — exactly one level fires per stock
- Operating EPS fallback is a silent switch — must not silently fail for stocks that legitimately have some negative quarters (threshold is 6 of 12, not any negative)

## Key Risks / Edge Cases
- FY0 = 0 exactly: divide-by-zero in L3 `|epsMostRecentFy|` — guard with `Math.abs(epsMostRecentFy) > 0.001` minimum
- Very early-stage company: all EPS negative for all quarters → L4, confidence floored, revenue-only base
- Rapidly growing shares outstanding: per-share computation critical; aggregate EPS growth would overstate
- L2 extrapolation with negative NTM: `epsNtm × (1 + revGrowthFwd)` could produce a sign change — valid, not an error

## Definition of Done
- [ ] Service implemented at `src/domain/classification/engines/earnings-engine.service.ts`
- [ ] Unit tests passing, ≥ 80% coverage
- [ ] No regression on existing classifier tests
- [ ] Implementation log updated
- [ ] Traceability comments in file

## Traceability
- Epic: EPIC-009
- PRD: `/docs/prd/3_aa_classification_workflow_prd_v_1.md` §Inputs
- RFC: RFC-009 §8, §8.3
- ADR: ADR-013 (V2 formula weights for historical EPS)
