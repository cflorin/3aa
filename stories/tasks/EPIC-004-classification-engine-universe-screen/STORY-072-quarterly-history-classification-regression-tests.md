# STORY-072 — Quarterly History Classification Engine Regression & Coherence Tests

## Epic
EPIC-004 — Classification Engine & Universe Screen

## Status
ready

## Purpose
Validate the full integration of quarterly trend metrics into the classification engine (STORY-065–069) with regression and coherence tests. Ensures scorer and confidence behavior is correct across all quarterly data scenarios, that graceful degradation works when quarterly data is absent, and that the existing classification test suite passes without modification.

## Story
As the **engineering team**,
I want **a comprehensive regression and coherence test suite for the quarterly history integration with the classification engine**,
so that **we can confidently ship the quarterly-aware classification engine without breaking existing classification behavior or introducing subtle coherence errors between trend signals and scorer outputs**.

## Outcome
- Integration test suite in `tests/integration/quarterly-history-classification.test.ts`
- Coherence tests verify that: quarterly signals in `ClassificationInput.trend_metrics` flow through to scorer outputs in the expected direction; confidence trajectory penalty fires under correct conditions; `shouldRecompute` quarterly trigger is detected correctly
- Graceful degradation coverage: all scorers behave identically to pre-STORY-065 when `trend_metrics` is absent
- Regression: full existing test suite (≥ 489 tests prior to EPIC-004 quarterly additions) continues to pass
- At least two end-to-end coherence scenarios:
  1. **Positive scenario**: stock with 12 quarters, improving EQ trend score (>0.30), no dilution, stable margins → EQ rating better than proxy-only baseline; confidence not degraded by trajectory penalty
  2. **Negative scenario**: stock with 5 quarters, deteriorating CFO/NI, `material_dilution_trend_flag = true`, stability score < 0.40 → confidence capped at MEDIUM, BS score impacted, EQ degraded

## Scope In
- `tests/integration/quarterly-history-classification.test.ts`
- End-to-end scenarios using fixed `ClassificationInput` with `trend_metrics` pre-populated (no database required for these tests — unit-style with real scorer code)
- Graceful degradation: each scorer called with `trend_metrics = undefined` → same output as before STORY-065
- `shouldRecompute` tests: `quarterly_data_updated` trigger fires; existing triggers unaffected
- Confidence Step 5: all five penalty conditions tested; absent `trend_metrics` → Step 5 skipped
- Regression: confirm all ≥ 489 existing tests pass (test count assertion)

## Scope Out
- Database/API integration tests for the sync pipeline (STORY-064)
- UI tests (STORY-070, STORY-071)
- Performance benchmarks

## Dependencies
- **Epic:** EPIC-004
- **Upstream:** STORY-065–069 (all quarterly history classification integration stories)

## Preconditions
- All STORY-065–069 implementations complete
- Existing test infrastructure (Jest) available

## Inputs
- Fixed `ClassificationInput` fixtures with `trend_metrics` populated (various scenarios)
- Fixed `ClassificationInput` fixtures with `trend_metrics = undefined` (graceful degradation)

## Outputs
- `tests/integration/quarterly-history-classification.test.ts` — all tests passing
- Regression confirmation: existing ≥ 489 tests still pass

## Acceptance Criteria
- [ ] Positive scenario: improving quarterly signals produce better EQ rating; confidence not downgraded by trajectory penalty
- [ ] Negative scenario: deteriorating signals produce lower confidence (MEDIUM cap or LOW force); BS and EQ scores reflect trend signals
- [ ] EQ scorer: proxy fallback path produces identical output before/after STORY-066 when `trend_metrics` absent
- [ ] BS scorer: existing dilution flag path produces identical output before/after STORY-067 when `trend_metrics` absent
- [ ] Bucket scorer: baseline bucket output identical before/after STORY-068 when `trend_metrics` absent
- [ ] Confidence scorer: Step 5 absent when `trend_metrics` absent; output identical to pre-STORY-069 baseline
- [ ] `shouldRecompute` with `{ quarterlyDataUpdated: true }` returns `quarterly_data_updated` trigger
- [ ] `shouldRecompute` with `{ quarterlyDataUpdated: false }` and no other changes → no recompute
- [ ] All existing ≥ 489 tests continue to pass (no regression)
- [ ] All five confidence trajectory penalty conditions individually tested

## Traceability
- Epic: EPIC-004 — Classification Engine & Universe Screen
- RFC: RFC-001 Amendment 2026-04-25, RFC-008
- ADR: ADR-014 Amendment 2026-04-25, ADR-016
