# STORY-069 — Confidence Step 5: Trajectory Quality Penalty (ADR-014 Amendment 2026-04-25)

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
ready

## Purpose
Implement the trajectory quality penalty step (ADR-014 §Step 5) in the confidence scoring function. This new step runs between the existing flag-based confidence adjustments (old Step 4) and the final confidence output (old Step 5, renumbered Step 6). Degrades confidence when quarterly history signals indicate low data quality or deteriorating trends.

## Story
As the **classification engine**,
I want **confidence scores to be degraded when quarterly trajectory data reveals low data quality or deteriorating earnings patterns**,
so that **confidence ratings reflect not just the point-in-time classification signals but also the reliability of the underlying trend data**.

## Outcome
- Confidence computation updated in `src/modules/classification-engine/scorers/confidence.scorer.ts` (or equivalent)
- New Step 5 inserted between old Steps 4 and 5 (renumbered as Step 6)
- Step 5 logic:
  - `quarters_available < 4` → force confidence to LOW (overrides all prior steps)
  - `quarters_available >= 4 AND < 8` → cap confidence at MEDIUM (cannot reach HIGH)
  - `operating_margin_stability_score < 0.40` → degrade one level (HIGH→MEDIUM, MEDIUM→LOW)
  - `deteriorating_cash_conversion_flag = true AND suggested_eq IN [A, B]` → degrade one level
  - `earnings_quality_trend_score < -0.50` → degrade one level
  - Multiple conditions are additive (each degrade applies independently, floor at LOW)
- When `trend_metrics` absent or `stock_derived_metrics` has no row → Step 5 skipped entirely (backwards compatible)
- Structured logging: `confidence_trajectory_penalty_applied` event with conditions triggered
- Existing confidence unit tests (no quarterly data) continue to pass unchanged

## Scope In
- Confidence scorer — new Step 5 logic block
- All five trajectory penalty conditions implemented
- Graceful skip when `trend_metrics` absent
- `quarters_available` gating for LOW-force and MEDIUM-cap conditions
- Unit tests for each condition independently and in combination

## Scope Out
- EQ scorer — STORY-066
- BS scorer — STORY-067
- Bucket scorer — STORY-068
- Populating trend metrics fields — STORY-062

## Dependencies
- **Epic:** EPIC-004
- **RFCs:** RFC-001 Amendment 2026-04-25 (confidence scoring with trajectory)
- **ADRs:** ADR-014 Amendment 2026-04-25 (Step 5 trajectory quality penalty)
- **Upstream:** STORY-065 (ClassificationTrendMetrics wired into ClassificationInput), STORY-062 (stability scores and flags populated)

## Preconditions
- `ClassificationTrendMetrics` type includes `quarters_available`, `operating_margin_stability_score`, `deteriorating_cash_conversion_flag`, `earnings_quality_trend_score`
- Existing confidence scorer steps 1–4 (and old Step 5 → renumbered Step 6) in place
- STORY-065 wires `trend_metrics` into `ClassificationInput`

## Inputs
- `ClassificationInput.trend_metrics?.quarters_available`
- `ClassificationInput.trend_metrics?.operating_margin_stability_score`
- `ClassificationInput.trend_metrics?.deteriorating_cash_conversion_flag`
- `ClassificationInput.trend_metrics?.earnings_quality_trend_score`
- Prior steps' confidence output (input to Step 5 degradation)

## Outputs
- Final confidence level (LOW / MEDIUM / HIGH) after trajectory penalty applied
- Structured log entry when any penalty condition fires

## Acceptance Criteria
- [ ] `quarters_available < 4` → final confidence = LOW regardless of prior steps
- [ ] `quarters_available >= 4 AND < 8` → final confidence ≤ MEDIUM (HIGH capped to MEDIUM)
- [ ] `operating_margin_stability_score < 0.40` → degrades one level
- [ ] `deteriorating_cash_conversion_flag = true AND suggested_eq IN [A, B]` → degrades one level
- [ ] `earnings_quality_trend_score < -0.50` → degrades one level
- [ ] Multiple conditions: each degrade applied; floor at LOW
- [ ] `trend_metrics` absent → Step 5 skipped; confidence output from Step 4 / Step 6 unchanged
- [ ] `confidence_trajectory_penalty_applied` log event emitted with conditions list when Step 5 fires
- [ ] All existing confidence scorer unit tests pass without modification
- [ ] New tests: each condition individually; two simultaneous conditions; all conditions; absent trend_metrics → no change

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 Amendment 2026-04-25
- ADR: ADR-014 Amendment 2026-04-25 (Step 5 — Trajectory Quality Penalty)
