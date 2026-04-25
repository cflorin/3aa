# STORY-081 — EPIC-005 Regression & Integration Tests

## Epic
EPIC-005 — Valuation Threshold Engine & Enhanced Universe

## Purpose
Validate EPIC-005 as a complete system: golden-set regression for all 16 anchored codes against the threshold derivation spec, end-to-end pipeline test (batch job → DB → API → UI assertion), schema contract tests, and cross-epic regression confirming classification + valuation operate correctly together.

## Story
As the development team,
I want a comprehensive regression and integration test suite for the full valuation pipeline,
so that any future change to thresholds, derivation logic, or scoring immediately surfaces before deployment.

## Outcome
A test suite in `tests/integration/valuation/` and `tests/e2e/valuation/` that:
- Runs all 16 anchored codes through `computeValuation()` and asserts exact zone outputs (golden-set)
- Verifies the full nightly batch → DB → API round-trip against a real test DB
- Confirms `ValuationResult` TypeScript type matches `ValuationState` Prisma model (schema contract)
- Verifies cross-epic: stock added → classified → valuation computed → zone readable via API
- Catches threshold derivation regressions: any adjustment table change breaks a golden-set test

## Scope In
- **Golden-set regression tests** (`tests/unit/valuation/golden-set.test.ts`):
  - All 16 anchored codes: exact `max_threshold`, `comfortable_threshold`, `very_good_threshold`, `steal_threshold` values from the threshold derivation spec
  - 10+ derived code examples from spec (4BB, 4AC, 3CA, 5BC, 6BC, 7BB, etc.) — verify adjusted threshold values
  - Zone assignment for each anchored code with representative multiples: one multiple per zone per code
  - TSR hurdle: all 8 buckets × 9 EQ+BS combinations → adjusted hurdle formula
  - Secondary adjustments: gross margin all bands, dilution trigger, cyclicality passthrough
- **Integration tests** (`tests/integration/valuation/`):
  - `persistValuationState` against real test DB: insert stock → persist → read back → assert all ValuationState fields
  - Batch job: POST /api/cron/valuation → all in-universe test stocks processed → valuation_state rows present
  - Override round-trip: PUT override → recompute → zone reflects override; DELETE → reverts
  - `GET /api/stocks/[ticker]/valuation` returns correct structure
  - `GET /api/universe/stocks?valuationZone=steal_zone` returns only matching stocks
- **Schema contract tests** (`tests/contract/valuation-schema.test.ts`):
  - `ValuationResult` interface fields → `ValuationState` Prisma model fields: names, types, nullability must match
  - `UserValuationOverride` Prisma model includes all 3 new fields added in STORY-078
- **Cross-epic regression** (`tests/integration/valuation/cross-epic.test.ts`):
  - EPIC-004 classification batch → EPIC-005 valuation batch: stock classified as 4AA → valuation uses anchored thresholds for 4AA → zone computable
  - `suggested_code` (not user classification override) drives valuation_state
  - Classification code change → `shouldRecompute()` returns true → valuation recomputed
- **BDD acceptance scenarios** (`tests/integration/valuation/bdd-acceptance.test.ts`):
  - "4AA stock at forward P/E 18x → comfortable_zone" (all output fields verified)
  - "3CA stock with missing forward_pe, cyclicality_flag → manual_required, no fallback"
  - "6BA stock at EV/Sales 4.5x, gross_margin 75% → no gross_margin_adjustment, very_good_zone"
  - "7BA stock at EV/Sales 12x, dilution_flag=true → adjusted thresholds, above_max"
  - "B8 stock → not_applicable, no thresholds, no TSR hurdle"
  - "Holding company with null forward_operating_earnings_ex_excess_cash → manual_required_insurer"
  - "User provides forward_operating_earnings_ex_excess_cash=45.2 → zone computed, status=ready"

## Scope Out
- UI E2E tests (covered in STORY-079/080)
- Alert engine integration (EPIC-006)
- Performance load tests (out of V1 scope)

## Dependencies
- STORY-075 (domain layer — golden-set)
- STORY-076 (persistence — integration tests)
- STORY-077 (batch job — cron integration test)
- STORY-078 (override API — override round-trip test)
- STORY-079/080 (UI — E2E referenced but owned by those stories)

## Test Infrastructure Requirements
- Real test DB (same pattern as existing integration tests)
- Test DB seeded with: anchored_thresholds (18 rows), tsr_hurdles (8 rows), 5 test stocks (covering B1, B4, B5, B6, B8 buckets), classification states for each
- No LLM calls in integration tests (enrichment mocked or seeded)

## Acceptance Criteria
- [ ] All 16 anchored code golden-set tests pass with exact threshold values from spec (B8 produces not_applicable — verified separately)
- [ ] 10+ derived code examples pass with correct adjusted values
- [ ] All 8-bucket × 9-EQ/BS-combination TSR hurdle tests pass
- [ ] `persistValuationState` round-trip integration test passes (DB read-back matches compute output)
- [ ] Batch job cron integration test: POST → all test stocks have valuation_state rows
- [ ] Override round-trip integration test passes
- [ ] Schema contract test: TypeScript compilation verifies `ValuationResult` ↔ `ValuationState` field alignment
- [ ] Cross-epic: `suggested_code` drives valuation, user classification override does not
- [ ] All 7 BDD acceptance scenarios pass
- [ ] Total EPIC-005 test count ≥ 80 (unit + integration combined)

## Test Strategy Expectations
- Test file locations:
  - `tests/unit/valuation/golden-set.test.ts`
  - `tests/unit/valuation/tsr-hurdle-combinations.test.ts`
  - `tests/unit/valuation/secondary-adjustments.test.ts`
  - `tests/integration/valuation/persistence.test.ts`
  - `tests/integration/valuation/batch-job.test.ts`
  - `tests/integration/valuation/override-api.test.ts`
  - `tests/integration/valuation/universe-api.test.ts`
  - `tests/integration/valuation/cross-epic.test.ts`
  - `tests/integration/valuation/bdd-acceptance.test.ts`
  - `tests/contract/valuation-schema.test.ts`
- All test describe blocks follow naming: `describe('EPIC-005/STORY-08X/TASK-08X-00X: [description]')`

## Regression / Invariant Risks
- Golden-set tests are the primary guard against silent threshold derivation changes
- Schema contract test must re-run on every Prisma migration (add to CI pre-push gate)
- Cross-epic test confirms the `suggested_code` invariant: if this breaks, user classification overrides would silently influence system alerts (security/integrity risk per ADR-007)

## Definition of Done
- [ ] All test files implemented and passing
- [ ] ≥ 80 total EPIC-005 tests (unit + integration)
- [ ] No regressions in prior test suites (EPIC-001–004 tests still green)
- [ ] CI pipeline runs all new tests
- [ ] Implementation log updated
- [ ] Traceability comments in all test files (`// EPIC-005: ... STORY-081: ...`)

## Traceability
- Epic: EPIC-005 — Valuation Threshold Engine & Enhanced Universe
- PRD: `docs/prd/3_aa_threshold_derivation_spec_valuation_zones_tsr_hurdles_v_1.md` (golden-set values sourced from here)
- RFC: RFC-003 — Valuation & Threshold Engine Architecture (complete spec for all acceptance scenarios)
- ADR: ADR-005 — Threshold Management (anchored + derivation golden-set coverage)
- ADR: ADR-007 — Multi-User Architecture (cross-epic suggested_code invariant test)
