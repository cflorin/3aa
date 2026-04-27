# STORY-102 — Revenue Engine Service

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Implement the Revenue Engine as a standalone, pure-function service that computes `normalized_revenue_growth` from the 20-quarter TTM revenue series and forward estimate. This is the 0.45-weight component in the base growth formula and the highest-weight signal in the entire engine. It must be independently testable and separated from the bucket assembly logic.

## Story
As the Earnings Path Engine,
I want a Revenue Engine service that computes normalized revenue growth from quarterly history,
so that the bucket formula has a durable, non-distorted revenue signal as its primary input.

## Outcome
`RevenueEngineService.compute(input)` returns `normalized_revenue_growth`, component values (`revenue_growth_hist_long`, `revenue_growth_hist_recent`, `revenue_growth_acceleration`), and a confidence reduction from revenue data quality issues. The service is pure (no DB access), fully unit-tested, and ready to be called by the Final Formula service (STORY-108).

## Scope In
- Service: `src/domain/classification/engines/revenue-engine.service.ts`
- Input: array of TTM revenue values (ascending chronological order), `revenue_growth_fwd` (nullable)
- TTM computation: rolling 4-quarter sum of `StockQuarterlyHistory.revenue` → TTM series
- `revenue_growth_hist_long`: OLS log-slope or CAGR over the full TTM series
- `revenue_growth_hist_recent`: OLS log-slope or CAGR over the 8 most recent TTM quarters
- `revenue_growth_acceleration`: `recent − long`
- Normalized: `0.40 × long + 0.30 × recent + 0.30 × fwd` (with re-weighting when components absent — see §3.2.3)
- Re-weighting rules: fwd absent → +0.18 long, +0.12 recent; long absent → split between recent and fwd; both history absent → fwd only
- Confidence reductions as defined in §3.12.2: recent < 8Q → −0.10; long < 12Q → −0.10; fwd absent → −0.05; both history absent → −0.20; data quality flag (one quarter > 50% of growth) → −0.10
- `data_quality_flag` detection: if any single TTM quarter contributes > 50% of period growth
- Output: `NormalizedRevenueGrowthResult` with all components and confidence reductions

## Scope Out
- Not responsible for fetching quarterly history (caller passes the TTM series)
- Not responsible for writing to DB
- Not responsible for the EPS component or overall formula assembly
- No cap/floor on the computed growth value (guardrails are STORY-108 concern)
- No OLS library selection mandate — CAGR approximation acceptable for V1 (note in code)

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §7 (Revenue Engine specification)
- ADR: ADR-013 V2 base formula weights (0.40/0.30/0.30)
- Framework: V2.1 §3.2 Revenue Engine
- Upstream: STORY-100 (types available); no runtime dependency on STORY-101

## Preconditions
- `StockQuarterlyHistory` has at least 1 revenue record for the stock
- `revenue` field in quarterly history can be null (some quarters may be missing)

## Inputs
- `revenueTtmSeries: number[]` — TTM revenue values, ascending chronological order
- `revenueGrowthFwd: number | null` — single forward year revenue growth rate (already on Stock)

## Outputs
```typescript
interface NormalizedRevenueGrowthResult {
  normalizedRevenueGrowth: number;
  revenueGrowthHistLong: number | null;
  revenueGrowthHistRecent: number | null;
  revenueGrowthAcceleration: number | null;
  confidenceReductions: RevenueConfidenceReduction[];
  dataQualityFlag: boolean;
}
```

## Acceptance Criteria
- [ ] Service returns correct `normalizedRevenueGrowth` given a full 20-quarter series with fwd
- [ ] Service correctly re-weights when `revenueGrowthFwd` is null
- [ ] Service correctly re-weights when long history < 12 quarters
- [ ] Service handles all history absent (fwd-only base) with correct confidence reduction (−0.20)
- [ ] `data_quality_flag` fires when one quarter contributes > 50% of period growth
- [ ] Confidence reductions are additive and correctly reported
- [ ] Service is a pure function (no DB access, no side effects)
- [ ] Unit test coverage ≥ 80%
- [ ] All edge cases covered: 1-quarter series, all-null series, negative revenue quarters

## Test Strategy Expectations
- Unit tests (`tests/unit/classification/engines/revenue-engine.service.test.ts`):
  - Full 20Q series with all components present → correct weighted result
  - fwd null → re-weighting applied, fwd confidence reduction (−0.05)
  - Long history 6Q only → long absent confidence reduction applied
  - Both history absent → fwd-only base, −0.20 reduction
  - Data quality flag: single M&A quarter dominates → flag fires, −0.10 reduction
  - All nulls → service returns zero or throws defined error (spec: return null growth with max reduction)
  - Acceleration calculation: recent > long → positive acceleration
  - Revenue decline: negative growth values handled correctly
- Integration tests: N/A (pure function; no DB access)
- Contract/schema tests:
  - Output interface matches expected TypeScript shape
- BDD acceptance tests:
  - `Given` a 20-quarter revenue series with 8% long-term and 12% recent CAGR and 15% fwd growth; `When` the revenue engine runs; `Then` normalizedRevenueGrowth ≈ 0.40×0.08 + 0.30×0.12 + 0.30×0.15 = 0.113
- E2E: N/A

## Regression / Invariant Risks
- Must not touch `src/domain/classification/bucket-scorer.ts` (V1 scorer remains active until STORY-108)
- Must not import from bucket-scorer.ts or scoring-weights.ts
- OLS/CAGR computation: if using CAGR, negative start/end values are undefined — must handle gracefully without throwing

## Key Risks / Edge Cases
- Cyclical stocks with negative revenue quarters: TTM aggregation smooths single bad quarters but multi-quarter downturns show up in long-history slope correctly
- Very new stocks (< 4 quarters): TTM construction impossible; return null long + recent, fwd-only base, −0.20 confidence
- Revenue series with outlier acquisition quarter: data_quality_flag fires; value preserved (uncapped per spec)

## Definition of Done
- [ ] Service implemented at `src/domain/classification/engines/revenue-engine.service.ts`
- [ ] Unit tests passing with ≥ 80% coverage
- [ ] No regression on existing classifier tests
- [ ] Implementation log updated
- [ ] Traceability comments in service file

## Traceability
- Epic: EPIC-009
- PRD: `/docs/prd/3_aa_classification_workflow_prd_v_1.md` §Inputs
- RFC: RFC-009 §7
- ADR: ADR-013 (V2 base formula weights)
