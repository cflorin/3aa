# STORY-106 — Dilution and SBC Penalty Services

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Implement the Dilution Penalty and SBC Burden Penalty as a single service (or two co-located pure functions). Both are simple lookup tables applied to existing stored fields (`share_count_growth_3y` and `sbc_as_pct_revenue_ttm`). They enforce the per-share invariant: bucket is about per-share earnings compounding; dilution and excessive SBC erode the per-share path.

## Story
As the Earnings Path Engine,
I want Dilution and SBC Penalty services that compute per-share erosion penalties,
so that stocks with material dilution or SBC burden have their earnings path correctly discounted.

## Outcome
`DilutionPenaltyService.compute(shareCountGrowth3y)` and `SbcPenaltyService.compute(sbcAsPctRevenue)` each return the correct penalty per the ADR-013 V2 band tables. Both are pure functions covered by complete band-boundary tests.

## Scope In
- Service: `src/domain/classification/engines/dilution-sbc-penalty.service.ts` (single file, two exports)
- Dilution Penalty (from `share_count_growth_3y`):
  - ≤ 3% → 0%
  - (3%, 7%] → −1%
  - (7%, 12%] → −3%
  - > 12% → −6%
- SBC Burden Penalty (from `sbc_as_pct_revenue_ttm`, already in `StockDerivedMetrics`):
  - ≤ 8% → 0%
  - (8%, 15%] → −1%
  - > 15% → −3%
- Both return positive numbers (subtracted in formula)
- Handle null inputs: if `share_count_growth_3y` null → 0 penalty with reason code; if `sbc_as_pct_revenue_ttm` null → 0 penalty with reason code

## Scope Out
- Not responsible for `material_dilution_flag` (that is the valuation secondary adjustment, separate from bucket engine)
- Not responsible for computing `share_count_growth_3y` (already stored on Stock from existing pipeline)
- Not responsible for the threshold-level dilution haircut (§7.5 — that is valuation layer)
- No DB writes

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §11 (Dilution + SBC penalties)
- ADR: ADR-013 V2 penalty bands
- Framework: V2.1 §3.6
- Upstream: STORY-100 (types); uses existing Stock fields

## Preconditions
- `Stock.shareCountGrowth3y` already stored (existing field from EPIC-003)
- `StockDerivedMetrics.sbcAsPctRevenueTtm` already computed (existing from EPIC-005)

## Inputs
- `shareCountGrowth3y: number | null`
- `sbcAsPctRevenueTtm: number | null`

## Outputs
```typescript
interface DilutionSbcPenaltyResult {
  dilutionPenalty: number;   // positive; subtracted in formula
  sbcPenalty: number;        // positive; subtracted in formula
  dilutionReasonCode: string | null;
  sbcReasonCode: string | null;
}
```

## Acceptance Criteria
- [ ] Dilution band boundaries correct: exactly 3% → 0%; 3.01% → −1%; 7% → −1%; 7.01% → −3%; 12% → −3%; 12.01% → −6%
- [ ] SBC band boundaries correct: 8% → 0%; 8.01% → −1%; 15% → −1%; 15.01% → −3%
- [ ] Null share count growth → 0 penalty (not an error)
- [ ] Null SBC → 0 penalty (not an error)
- [ ] Both penalties are positive values (formula subtracts them)
- [ ] Unit test coverage = 100% (boundary tests for all band edges)

## Test Strategy Expectations
- Unit tests (`tests/unit/classification/engines/dilution-sbc-penalty.service.test.ts`):
  - Dilution: all 4 bands + exact boundary values (3%, 7%, 12%)
  - SBC: all 3 bands + exact boundary values (8%, 15%)
  - Null inputs: both return 0 penalty
  - High dilution + high SBC: penalties are independent (additive)
- BDD:
  - `Given` share_count_growth_3y = 5% and sbc_as_pct_revenue_ttm = 10%; `When` penalties computed; `Then` dilutionPenalty = 0.01, sbcPenalty = 0.01
- E2E: N/A

## Regression / Invariant Risks
- Band boundary direction: upper bound inclusive for lower bands (≤ 3% → 0%, not < 3%)
- Do not confuse `share_count_growth_3y` (3-year share count growth) with the quarterly dilution fields on `StockDerivedMetrics` — they are different

## Key Risks / Edge Cases
- Buyback companies have negative `share_count_growth_3y` → penalty = 0 (correct; buybacks improve per-share path)
- SBC = 0 (rare) → 0 penalty, no reason code

## Definition of Done
- [ ] Service implemented at `src/domain/classification/engines/dilution-sbc-penalty.service.ts`
- [ ] 100% unit test coverage of band boundaries
- [ ] No regression on existing tests
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-009
- RFC: RFC-009 §11
- ADR: ADR-013 (V2 penalty bands)
- Framework: V2.1 §3.6
