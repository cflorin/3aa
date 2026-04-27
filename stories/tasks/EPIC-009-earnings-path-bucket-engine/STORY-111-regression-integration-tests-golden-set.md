# STORY-111 — Regression and Integration Tests: EPIC-009 Golden Set

## Epic
EPIC-009 — Earnings Path Bucket Engine

## Purpose
Implement the full regression and integration test suite for EPIC-009. This story creates the golden-set BDD tests for the four archetype scenarios (NVIDIA-type, MSFT-type, Uber-type, Ford-type) from Appendix D of the V2.1 framework, verifies that the complete EPIC-008 regression baseline still holds, and ensures the V2 bucket engine produces deterministic, auditable outputs. This story is the last gate before EPIC-009 is declared complete.

## Story
As a developer and investor,
I want a comprehensive regression and integration test suite for the V2 bucket engine,
so that future code changes cannot silently change bucket assignments, regime routing, or confidence scores without a failing test.

## Outcome
All four archetype scenarios pass as BDD integration tests. The full EPIC-008 regime routing golden set still passes (no regressions). Every component service (STORY-102–107) has a regression guard. The EPIC-009 baseline test count is established and logged.

## Scope In
- BDD feature files: `tests/bdd/classification/epic-009-earnings-path-engine.feature`
- BDD feature files: `tests/bdd/valuation/epic-009-regime-selector-v2.feature`
- Archetype golden-set scenarios (from V2.1 Appendix D):
  - NVIDIA scenario: strong revenue + `emerging_now` OL + cyclicality score 2–3 at normal cycle → Bucket 5 or 6; `profitable_growth_pe` regime
  - MSFT scenario: durable revenue + `gradual` OL + strong FCF/margins → Bucket 4 or 5; `profitable_growth_pe` regime
  - Uber scenario: strong revenue + `emerging_now` OL + improving margins crossing 25% threshold → Bucket 5; regime boundary between `profitable_growth_pe` and `sales_growth_standard`
  - Ford scenario: `cyclical_rebound` OL + cyclical peak penalty (score 3) + modest revenue growth → Bucket 1 or 2; `cyclical_earnings` regime
- Regime routing regression (EPIC-008 golden set from STORY-096): all cases must still pass
- Per-engine regression guards:
  - Revenue engine: 3 scenarios (full data, fwd missing, both history missing)
  - Earnings engine: L1–L4 fallback chain — one test per level
  - OL engine: all 5 states — one test per state (including `cyclical_rebound` V2.1 tightening)
  - Cyclicality normalisation: key matrix cells (score 3 peak, score 2 depressed)
  - Dilution/SBC penalties: band boundaries
  - Qualitative modifier: all three outcomes
- Confidence model regression: verify low-confidence stocks trigger effective bucket demotion in valuation
- Determinism guard: same inputs, multiple runs → same output (no randomness)
- V1 bucket comparison test: for each archetype, show what V1 BucketScorer would have produced vs V2 engine (document the delta; this is informational, not a pass/fail gate)

## Scope Out
- Performance benchmarks
- Load testing
- UI regression (covered by E2E tests if available)
- TSR hurdle regression (TSR is V1-unchanged; separate epic)
- Production data validation (this is staging/dev test suite only)

## Dependencies
- Epic: EPIC-009
- RFC: RFC-009 §22 (Illustrative Expected Outcomes)
- Framework: V2.1 Appendix D (worked examples — NVIDIA, MSFT, Uber, Ford)
- Upstream: ALL STORY-100–110 must be complete before this story runs

## Preconditions
- Fleet-wide migration (STORY-110) has completed in the test environment
- All active universe stocks have `expectedNormalizedEpsGrowth` non-null
- Test database seeded with archetype scenarios

## Inputs
- Archetype scenario inputs from V2.1 Appendix D (4 scenarios with specific metric values)
- EPIC-008 regime golden set from STORY-096

## Outputs
- `tests/bdd/classification/epic-009-earnings-path-engine.feature` — 4 archetype BDD scenarios
- `tests/bdd/valuation/epic-009-regime-selector-v2.feature` — regime routing tests
- `tests/integration/classification/epic-009-full-pipeline.test.ts` — end-to-end integration test
- Baseline test count logged in implementation log
- V1 vs V2 delta report (informational)

## Acceptance Criteria
- [ ] NVIDIA scenario: `bucketSuggested ∈ {5, 6}` and `regime = profitable_growth_pe`
- [ ] MSFT scenario: `bucketSuggested ∈ {4, 5}` and `regime = profitable_growth_pe`
- [ ] Uber scenario: `bucketSuggested = 5` and regime is `profitable_growth_pe` or `sales_growth_standard` depending on margin gate
- [ ] Ford scenario: `bucketSuggested ∈ {1, 2}` and `regime = cyclical_earnings`
- [ ] ABBV scenario: `regime = high_amortisation_earnings` (tests Step 2.5 in production routing)
- [ ] All EPIC-008 regime routing golden-set tests pass unchanged
- [ ] `cyclical_rebound` V2.1 tightening: a Ford-like at `cycle_position = elevated` is NOT classified as `cyclical_rebound` → falls to `gradual` or `none`
- [ ] L1–L4 fallback regression: all four fallback levels produce the expected confidence reduction
- [ ] Determinism: same input run twice → identical output
- [ ] Confidence demotion: a stock with `bucketConfidence < 0.60` and `bucketSuggested = 5` → effective bucket used in valuation = 4
- [ ] Total passing tests ≥ pre-EPIC-009 baseline + EPIC-009 new tests

## Test Strategy Expectations
- Unit tests:
  - Already covered by STORY-102–107; this story adds only integration-level and BDD tests
- Integration tests (`tests/integration/classification/epic-009-full-pipeline.test.ts`):
  - Full stock-to-bucket pipeline: seed quarterly history → run classifier → verify ClassificationState
  - Regime selector integration: seed ClassificationState + Stock → run regime selector → verify regime
  - Confidence demotion integration: low-confidence bucket 5 → effective bucket 4 in ThresholdAssigner
- BDD feature files:
  - `Given/When/Then` scenarios for all 4 archetypes + ABBV Step 2.5
  - `Given/When/Then` for EPIC-008 regime golden set (converted to BDD if not already)
- Contract/schema tests:
  - Post-migration: verify all ClassificationState rows have non-null V2 fields
  - Verify `scores` Json contains bucket engine breakdown fields
- E2E tests:
  - If UI E2E available: verify universe screen shows updated bucket for a known stock post-migration

## Regression / Invariant Risks
- This story is the final regression gate — if it passes, EPIC-009 is complete
- EQ and BS scoring MUST be unchanged — any change to EQ/BS test expectations is a red flag
- The EPIC-008 golden set (STORY-096) is the baseline for regime routing — if any regime test changes, investigate before accepting

## Key Risks / Edge Cases
- Archetype scenario inputs are directional (not derived from real stock data) — the engine may produce slightly different buckets than the worked examples if the formula weights shift; the test should assert a bucket range (e.g. `∈ {5,6}`) not a single value
- V1 vs V2 delta: some stocks that were Bucket 5 in V1 may become Bucket 3 or 4 in V2 — this is expected and correct (semantic change); the delta report is informational
- If a scenario fails due to a genuine bug, this story must block EPIC-009 completion — no exceptions

## Definition of Done
- [ ] All BDD scenarios passing
- [ ] All integration tests passing
- [ ] EPIC-008 regime golden set still passing
- [ ] V1 vs V2 delta documented in implementation log (informational)
- [ ] Baseline test count logged (was 1803, now X)
- [ ] Implementation log entry for EPIC-009 completion
- [ ] `BucketScorer` file either deleted or archived; no live path calls it

## Traceability
- Epic: EPIC-009
- RFC: RFC-009 §22 (illustrative outcomes)
- Framework: V2.1 Appendix D (worked examples)
- ADR: ADR-013, ADR-014, ADR-017, ADR-018, ADR-019
