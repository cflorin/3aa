# STORY-105 — Cyclicality Normalisation Service

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Implement the Cyclical Peak Penalty computation as a standalone pure-function service. This service reads the `structural_cyclicality_score` × `cycle_position` matrix and returns the penalty to be subtracted from `expected_normalized_eps_growth`. It reuses EPIC-008 outputs directly and is intentionally minimal — the entire logic is a lookup table. Separating it keeps the final formula service (STORY-108) clean.

## Story
As the Earnings Path Engine,
I want a Cyclicality Normalisation service that computes the cyclical peak penalty from the score × position matrix,
so that companies at elevated or peak cycle have their earnings path corrected downward before bucket assignment.

## Outcome
`CyclicalityNormalisationService.computePenalty(score, cyclePosition)` returns the correct penalty (0% to 8%) per the V2.1 matrix. The service is a pure function with no DB access, covered by a complete matrix test (all score × position combinations).

## Scope In
- Service: `src/domain/classification/engines/cyclicality-normalisation.service.ts`
- Cyclical Peak Penalty Matrix (§3.5.1 of V2.1 framework):
  - score 0, any → 0%
  - score 1, normal/insufficient_data → 0%; elevated/peak → −2%
  - score 2, normal/insufficient_data → −2%; elevated/peak → −5%
  - score 3, normal/insufficient_data → −4%; elevated/peak → −8%
  - any, depressed → 0% (do not penalise depressed cyclicals in bucket engine)
- Returns penalty as a positive number (STORY-108 subtracts it)
- The penalty is the raw result — `cyclical_rebound` cap (+2% contribution from STORY-104) is a separate concern; both effects apply and can partially offset each other

## Scope Out
- Not responsible for `cycle_position` computation (that is EPIC-008's CyclicalScoreService)
- Not responsible for the threshold-level cyclical overlay (§7 / §8 — that is the existing CyclicalOverlay in the valuation layer)
- Not responsible for `cyclical_rebound` state classification (STORY-104)
- No UI changes

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §10 (Cyclical Peak Penalty matrix)
- ADR: ADR-018 (Cyclical Overlay Framework — distinguishes bucket engine penalty from threshold overlay)
- Framework: V2.1 §3.5
- Upstream: STORY-100 (types); EPIC-008 outputs (`structural_cyclicality_score`, `cycle_position`) must be present on Stock

## Preconditions
- EPIC-008 CyclicalScoreService has populated `structural_cyclicality_score` and `cycle_position` on all active stocks

## Inputs
- `structuralCyclicalityScore: number` (0–3, from Stock)
- `cyclePosition: string` ('normal' | 'elevated' | 'peak' | 'depressed' | 'insufficient_data')

## Outputs
```typescript
interface CyclicalPeakPenaltyResult {
  cyclicalPeakPenalty: number;  // positive value; subtracted in formula
  reasonCode: string | null;    // e.g. 'CYCLICAL_PEAK_PENALTY_HIGH', null if penalty = 0
}
```

## Acceptance Criteria
- [ ] All 15 matrix cells (5 positions × 3 non-zero scores) return correct penalty
- [ ] Score 0 always returns 0 regardless of cycle position
- [ ] `depressed` always returns 0 regardless of score
- [ ] Score 3 at peak returns −8% (0.08 as positive value)
- [ ] Score 2 at elevated returns −5% (0.05)
- [ ] Score 1 at elevated returns −2% (0.02)
- [ ] Service is a pure function
- [ ] Unit test coverage = 100% (matrix lookup is small and fully testable)

## Test Strategy Expectations
- Unit tests (`tests/unit/classification/engines/cyclicality-normalisation.service.test.ts`):
  - Full matrix coverage: all score × position combinations verified
  - Score 0: all positions return 0
  - depressed: all scores return 0
  - insufficient_data treated same as normal (0 for score 1, −2% for score 2, −4% for score 3)
  - Score 3 peak: returns 0.08
  - Reason code present when penalty > 0
- Integration tests: N/A
- Contract tests: penalty is a non-negative number (the formula subtracts it)
- BDD:
  - `Given` structural_cyclicality_score = 3 and cycle_position = 'elevated'; `When` cyclicality penalty computed; `Then` penalty = 0.08
  - `Given` structural_cyclicality_score = 2 and cycle_position = 'depressed'; `When` cyclicality penalty computed; `Then` penalty = 0 (do not penalise depressed)
- E2E: N/A

## Regression / Invariant Risks
- Must not confuse this penalty (bucket engine correction) with the threshold-level cyclical overlay in the valuation layer — they are separate mechanisms that both apply
- The `insufficient_data` case: must be treated the same as `normal` (not as `depressed`)

## Key Risks / Edge Cases
- Score values from EPIC-008 are integers 0–3; guard against out-of-range values (treat as 0 with reason code)
- New `cycle_position` values from EPIC-008 may be added in future — default to 0 penalty with a `UNKNOWN_CYCLE_POSITION` reason code

## Definition of Done
- [ ] Service implemented at `src/domain/classification/engines/cyclicality-normalisation.service.ts`
- [ ] 100% unit test coverage of all matrix cells
- [ ] No regression on existing tests
- [ ] Implementation log updated

## Traceability
- Epic: EPIC-009
- RFC: RFC-009 §10
- ADR: ADR-018, ADR-019
- Framework: V2.1 §3.5
