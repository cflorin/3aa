# STORY-109 — Regime Selector Update: V2 Bucket Gates and Step 2.5

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Update the existing `RegimeSelectorService` (EPIC-008, STORY-092) for three V2.1 changes: (1) replace raw `revenue_growth_fwd` gates in Steps 2 and 4 with bucket-based gates, (2) move `high_amortisation_earnings` (Step 4.5) to Step 2.5 (before the cyclical check), and (3) update Step 1 to use `operating_leverage_state = emerging_now` in place of `pre_operating_leverage_flag`. The `v2BucketAvailable` flag gates all bucket-based changes.

## Story
As the regime selector,
I want to use V2 bucket values as growth gates in Steps 2 and 4, and route high-amortisation names before cyclical routing,
so that bucket-gated regime logic is more durable than single-year revenue growth proxies and high-D&A names always reach EV/EBITDA.

## Outcome
`RegimeSelectorService.selectRegime(input)` applies bucket-gated Steps 2 and 4 when `v2BucketAvailable = true`, routes high amortisation names before cyclicals (Step 2.5), and updates Step 1 to recognise `operating_leverage_state = emerging_now AND margin < 10%`. The `v2BucketAvailable` fallback to `revenue_growth_fwd` gates is removed after the fleet-wide migration (STORY-110).

## Scope In
- Modify: `src/domain/valuation/regime-selector.service.ts` (or wherever STORY-092 placed it)
- **Step 1 update:** Add `operatingLeverageState === 'emerging_now' AND operatingMarginTtm < 0.10` as a trigger for `sales_growth_standard`/`hyper` path (in addition to existing triggers). `pre_operating_leverage_flag` retained as legacy fallback.
- **Step 2 update:** `bucket ∈ {4,5,6,7}` replaces `revenueGrowthFwd >= 0.20` when `v2BucketAvailable = true`
- **Step 2.5 (new, before Step 3):** `high_amortisation_earnings` check:
  - `ebitdaNtm / ebitNtm >= 1.30` AND `netIncomePositive` AND `fcfPositive`
  - Fires BEFORE Step 3 (cyclical check)
- **Step 4 update:** `bucket ∈ {3,4}` replaces `revenueGrowthFwd >= 0.15` when `v2BucketAvailable = true`
- **Precedence table updated:** Step 2.5 inserted at priority 6 (between Step 2 and Step 3)
- V1 fallback: when `v2BucketAvailable = false`, original `revenue_growth_fwd` gates apply unchanged
- `v2BucketAvailable` derivation: computed by the caller as `classificationState.expectedNormalizedEpsGrowth != null` — **not a separate DB flag**. No new column needed. The regime selector receives this as a boolean in its input.
- Score-3 exception in Step 2: `structural_cyclicality_score = 3` re-routes to `cyclical_earnings` even if Step 2 conditions met — unchanged

## Scope Out
- Steps 0A, 0B, 0C, 0D, 3, 5, 6 are unchanged
- `profitable_growth_pe` growth tier (high/mid/standard) keyed on bucket — already implemented in STORY-093/095 as threshold selection; the tier key change is a STORY-110 / separate valuation concern
- `v2BucketAvailable` flag column itself is not a schema field — it is derived from whether `expectedNormalizedEpsGrowth` is non-null on ClassificationState (or passed as a computed boolean by the caller)
- Fleet-wide migration batch (STORY-110) handles the transition moment
- No UI changes in this story

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §16 (Regime Selector Updated Semantic)
- ADR: ADR-017 (Valuation Regime Selection — 2026-04-27 amendment)
- Framework: V2.1 §6.4 (all updated steps), §6.8 (fleet-wide cutover)
- Upstream: STORY-108 (must be complete — `operatingLeverageState` and bucket computed by engine); STORY-092 (existing service to modify)

## Preconditions
- `RegimeSelectorService` from STORY-092 is the current implementation
- `operatingLeverageState` field populated by STORY-108 on ClassificationState
- `ebitda_ntm` and `ebit_ntm` fields are available on Stock or passed through input (check STORY-092 inputs)

## Inputs
```typescript
// Additions to existing RegimeSelectorInput:
interface RegimeSelectorInputV2 extends RegimeSelectorInputV1 {
  bucket: number;                          // from V2 engine
  operatingLeverageState: OperatingLeverageState;  // from STORY-108
  v2BucketAvailable: boolean;              // true after fleet migration
  ebitdaNtm: number | null;               // already in schema?
  ebitNtm: number | null;                 // already in schema?
}
```

## Outputs
- `ValuationRegime` enum (unchanged set of values: `not_applicable`, `financial_special_case`, `sales_growth_standard`, `sales_growth_hyper`, `profitable_growth_pe`, `cyclical_earnings`, `profitable_growth_ev_ebit`, `high_amortisation_earnings`, `mature_pe`, `manual_required`)
- No new regime values in EPIC-009

## Acceptance Criteria
- [ ] Step 2 with `v2BucketAvailable = true`: bucket 3 → does NOT qualify; bucket 4 → qualifies (with margin/FCF conditions)
- [ ] Step 2 with `v2BucketAvailable = false`: falls back to `revenueGrowthFwd >= 0.20` gate
- [ ] Step 4 with `v2BucketAvailable = true`: bucket 2 → does NOT qualify; bucket 3 → qualifies (with margin conditions)
- [ ] Step 2.5 fires BEFORE Step 3: a stock with `ebitda/ebit ≥ 1.30` AND `cyclicality_score ≥ 1` AND profitable → `high_amortisation_earnings` (not `cyclical_earnings`)
- [ ] Step 2.5 does NOT fire for a stock that qualified Step 2 (Step 2 wins first)
- [ ] Step 1 update: `emerging_now AND margin < 10%` → `sales_growth_standard`/`hyper` path
- [ ] Score-3 exception in Step 2 unchanged: cyclicality = 3 → re-routes to `cyclical_earnings`
- [ ] All existing STORY-092 golden-set regime tests still pass when `v2BucketAvailable = false`
- [ ] Unit test coverage ≥ 80%

## Test Strategy Expectations
- Unit tests (`tests/unit/valuation/regime-selector.service.test.ts`):
  - Step 2 V2 gate: bucket 4 + margin ≥ 25% + profitable + FCF ≥ 0.60 → profitable_growth_pe
  - Step 2 V2 gate: bucket 3 + same conditions → does NOT reach profitable_growth_pe (falls through)
  - Step 2 V1 fallback: v2BucketAvailable = false, revGrowthFwd = 0.22 → profitable_growth_pe
  - Step 2.5: ABBV scenario (ebitda/ebit = 1.76, cyclicality = 1, profitable) → high_amortisation_earnings
  - Step 2.5 ordering: Step 2.5 fires before Step 3 for ABBV-like
  - Step 2.5 does not fire when Step 2 already fired (MSFT-like with bucket 4 + high margin)
  - Step 4 V2 gate: bucket 3 + margin 10–25% + profitable → profitable_growth_ev_ebit
  - Step 1 OL update: emerging_now + margin < 10% → sales path
  - Existing regime golden set still passes under v2BucketAvailable = false
- Integration tests:
  - Given a full ClassificationState + StockDerivedMetrics row; when regime selected with V2 engine live; verify regime assignment for NVDA-like, ABBV-like, Ford-like
- BDD:
  - `Given` ABBV-like stock with ebitda/ebit = 1.76, cyclicality_score = 1, profitable; `When` regime selected (v2BucketAvailable = true); `Then` regime = high_amortisation_earnings
  - `Given` same stock with v2BucketAvailable = false; `When` regime selected; `Then` regime = cyclical_earnings (old behavior for backward compat test)
- E2E: covered by STORY-111

## Regression / Invariant Risks
- All EPIC-008 regime selector tests (golden set from STORY-096) must pass with `v2BucketAvailable = false`
- The Step 2.5 insertion must not break the existing `high_amortisation_earnings` routing that may already be tested from STORY-092 — check if this step already exists in STORY-092 and update its position
- `ebitda_ntm` and `ebit_ntm` availability: verify these are already on the input to the regime selector from STORY-092; if not, extend the input type

## Key Risks / Edge Cases
- MSFT has low D&A (ebitda/ebit ≈ 1.19) → Step 2.5 does NOT fire; correctly reaches Step 2
- A stock that barely fails Step 2 (e.g. FCF conversion = 0.55) but has high D&A → Step 2.5 fires → correct
- `v2BucketAvailable` derivation: computed from whether `ClassificationState.expectedNormalizedEpsGrowth` is non-null; not a separate DB column

## Definition of Done
- [ ] `RegimeSelectorService` updated with all three V2.1 changes
- [ ] Step 2.5 inserted in correct position (before Step 3)
- [ ] V1 fallback preserved for `v2BucketAvailable = false`
- [ ] Unit tests passing, ≥ 80% coverage
- [ ] EPIC-008 regime golden-set tests still passing
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-009
- RFC: RFC-009 §16
- ADR: ADR-017 (2026-04-27 amendment)
- Framework: V2.1 §6.4 (Steps 2, 2.5, 4), §6.8
