# STORY-068 — Bucket Scorer Quarterly Growth Context (Revenue TTM, Operating Leverage Tie-break)

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
ready

## Purpose
Enhance the Bucket scorer with quarterly-derived revenue TTM and operating leverage signals when quarterly history is available. The `revenue_ttm` from `stock_derived_metrics` provides a validated quarterly-computed revenue figure that can substitute for or supplement the fundamentals-sourced TTM revenue. The `operating_income_acceleration_flag` and `operating_leverage_ratio` can act as tie-break signals within bucket assignment.

## Story
As the **classification engine**,
I want **the Bucket scorer to optionally use quarterly-computed revenue TTM and operating leverage signals**,
so that **bucket assignments reflect the most accurate available revenue figures and can use operating leverage acceleration as a tie-break between adjacent buckets**.

## Outcome
- Bucket scorer updated in `src/modules/classification-engine/scorers/bucket.scorer.ts`
- When `trend_metrics` present: `revenue_ttm` from `ClassificationTrendMetrics` used as cross-check against fundamentals-sourced TTM revenue; discrepancy > 10% flagged in structured log (not an error; fundamentals-sourced value remains primary unless quarterly is more recent)
- `operating_income_acceleration_flag = true` acts as positive tie-break signal when bucket score falls within band between two adjacent buckets (e.g., borderline Bucket 2/3 → acceleration tips to Bucket 2)
- `operating_leverage_ratio` provides additional context; logged but not used as primary bucket driver in V1
- `pre_operating_leverage_flag` remains in bucket scorer scope unchanged (per RFC-008 §Balance Sheet Scorer scope clarification)
- When `trend_metrics` absent: bucket scorer behavior fully unchanged
- No change to bucket assignment output shape or bucket label set

## Scope In
- `src/modules/classification-engine/scorers/bucket.scorer.ts`
- `revenue_ttm` cross-check logging (not a scoring input — just observability)
- `operating_income_acceleration_flag` as tie-break signal (clearly scoped to borderline cases with defined band threshold)
- `pre_operating_leverage_flag` behavior preserved unchanged

## Scope Out
- EQ scorer — STORY-066
- BS scorer — STORY-067
- Confidence trajectory penalty — STORY-069
- Making `revenue_ttm` the primary revenue source for bucket scoring (V1: fundamentals-sourced remains primary)
- Adding new bucket labels or restructuring bucket score thresholds

## Dependencies
- **Epic:** EPIC-004
- **RFCs:** RFC-001 Amendment 2026-04-25, RFC-008 §Use in All Three Scorers (bucket tie-break)
- **ADRs:** ADR-013 (scoring weights), ADR-016
- **Upstream:** STORY-065 (ClassificationTrendMetrics wired), STORY-062 (operating leverage fields populated)

## Preconditions
- `ClassificationTrendMetrics` type includes `revenue_ttm`, `operating_income_acceleration_flag`, `operating_leverage_ratio`
- Existing bucket scorer with `pre_operating_leverage_flag` in scope

## Inputs
- `ClassificationInput.trend_metrics?.revenue_ttm` (optional cross-check)
- `ClassificationInput.trend_metrics?.operating_income_acceleration_flag` (tie-break)
- `ClassificationInput.trend_metrics?.operating_leverage_ratio`
- `ClassificationInput.trend_metrics?.quarters_available`
- All existing bucket scorer inputs unchanged

## Outputs
- Bucket assignment (same label set as today)
- Structured log when `revenue_ttm` discrepancy > 10%
- Same bucket scorer output shape (no breaking change)

## Acceptance Criteria
- [ ] `operating_income_acceleration_flag = true` tips borderline bucket assignment toward better bucket (tie-break only — not a primary driver)
- [ ] Tie-break band defined and documented in scorer (e.g., within ±5% of bucket threshold)
- [ ] `revenue_ttm` cross-check logged when discrepancy > 10%; does not change score
- [ ] `pre_operating_leverage_flag` behavior unchanged
- [ ] When `trend_metrics` absent: bucket scorer output identical to pre-STORY-068 behavior
- [ ] All existing bucket scorer unit tests pass without modification
- [ ] New tests: acceleration flag tie-break (borderline case tips); no tie-break outside band; absent trend_metrics → baseline output

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 Amendment 2026-04-25, RFC-008 §Use in All Three Scorers
- ADR: ADR-013 (scoring weights and bucket thresholds)
